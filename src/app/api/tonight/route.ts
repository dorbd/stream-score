import { NextRequest, NextResponse } from "next/server";
import { discoverMovies, getMovieDetail, getMovieGenres } from "@/lib/tmdbClient";
import { buildMovieResult, primeGenreCache } from "@/lib/buildMovieResult";
import { selectedKeysToTmdbIds } from "@/lib/providers";
import { getRequestContext } from "@/lib/requestContext";
import { getAmbientContext } from "@/lib/ambientContext";
import { getCulturalContext } from "@/lib/culturalContext";
import { classifyDaypart, DAYPART_BIAS } from "@/lib/daypart";
import { rerank, reasonSentence } from "@/lib/rerank";
import { getWildSignals, getTributeMovieIds } from "@/lib/wildSignals";
import type { MovieResult } from "@/lib/types";

function parseList(v: string | null): string[] {
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Decode `?dna=<base64>` query param into a number[7] (or null on failure).
 * Encoding: 7 × Float32 little-endian = 28 bytes → base64url ≈ 40 chars.
 */
function decodeUserDna(v: string | null): number[] | null {
  if (!v) return null;
  try {
    const normalized = v.replace(/-/g, "+").replace(/_/g, "/");
    const buf = Buffer.from(normalized, "base64");
    if (buf.byteLength < 28) return null;
    const view = new DataView(buf.buffer, buf.byteOffset, 28);
    const out: number[] = new Array(7);
    for (let i = 0; i < 7; i++) {
      const f = view.getFloat32(i * 4, true);
      if (!Number.isFinite(f)) return null;
      out[i] = Math.max(-1, Math.min(1, f));
    }
    return out;
  } catch {
    return null;
  }
}

const CANDIDATE_PAGES = 3; // 60 candidates from TMDb at vote_average.desc

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const reqCtx = getRequestContext(req);
    const region = (reqCtx.country ?? process.env.NEXT_PUBLIC_TMDB_REGION ?? "US").toUpperCase();
    const selectedKeys = parseList(sp.get("providers"));
    const onlyMine = sp.get("only_mine") !== "false";
    const tmdbProviderIds = selectedKeysToTmdbIds(selectedKeys);
    const watchlistIds = new Set(parseList(sp.get("watchlist")).map(Number).filter(Boolean));
    const hiddenIds = new Set(parseList(sp.get("hide")).map(Number).filter(Boolean));
    const moodGenres = parseList(sp.get("genres")).map(Number).filter(Boolean);
    const userDna = decodeUserDna(sp.get("dna"));

    // Fetch genre catalog so MovieResult.genres has names.
    const genres = await getMovieGenres().catch(() => []);
    primeGenreCache(genres);

    // Fetch parallel context.
    const [ambient, cultural, wild] = await Promise.all([
      getAmbientContext({ lat: reqCtx.lat, lng: reqCtx.lng }),
      getCulturalContext(),
      getWildSignals(),
    ]);
    const tributeMovieIds = await getTributeMovieIds([
      ...wild.bornTodayIds,
      ...wild.diedTodayIds,
    ]);

    const dp = classifyDaypart(reqCtx.hourLocal, reqCtx.dayOfWeek);
    const bias = DAYPART_BIAS[dp];

    // Pull N pages of high-quality candidates.
    const pages = await Promise.all(
      Array.from({ length: CANDIDATE_PAGES }, (_, i) =>
        discoverMovies({
          page: i + 1,
          sortBy: "vote_average.desc",
          voteCountGte: 800,
          voteAverageGte: 6.5 + (bias.ratingFloorBump ?? 0),
          watchRegion: region,
          watchProviderIds: onlyMine && tmdbProviderIds.length ? tmdbProviderIds : undefined,
          genreIds: moodGenres.length ? moodGenres : undefined,
          runtimeLte: bias.runtimePreference.max,
        }),
      ),
    );
    const candidates = pages.flatMap((p) => p.results);

    // Enrich top 30 by current popularity proxy with TMDb detail (for imdbId, runtime, watch providers).
    const ranked0 = [...candidates].sort((a, b) => b.popularity - a.popularity);
    const enrichTargets = ranked0.slice(0, 30).map((m) => m.id);
    const detailsSettled = await Promise.allSettled(
      enrichTargets.map((id) => getMovieDetail(id)),
    );
    const detailById = new Map<number, Awaited<ReturnType<typeof getMovieDetail>>>();
    detailsSettled.forEach((r, i) => {
      if (r.status === "fulfilled") detailById.set(enrichTargets[i], r.value);
    });

    const results: MovieResult[] = await Promise.all(
      candidates.map(async (m) => {
        const detail = detailById.get(m.id);
        return buildMovieResult(m, {
          region,
          selectedProviderKeys: selectedKeys,
          imdbId: detail?.imdbId ?? null,
          runtime: detail?.runtime ?? null,
          genres: detail ? detail.genres.map((g) => g.name) : undefined,
          watchProvidersByRegion: detail?.watchProviders,
        });
      }),
    );

    // Rerank
    const rankings = rerank({
      candidates: results,
      selectedProviderKeys: selectedKeys,
      hiddenIds,
      watchlistIds,
      hourLocal: reqCtx.hourLocal,
      dayOfWeek: reqCtx.dayOfWeek,
      ambient,
      cultural,
      locale: reqCtx.locale,
      wildGenreBoosts: wild.genreBoosts,
      wildKeywordHints: wild.keywordHints,
      tributeMovieIds,
      userDna,
    });

    const top = rankings.slice(0, 12).map((r) => ({
      ...r.movie,
      _tonight: {
        finalScore: Math.round(r.finalScore * 10) / 10,
        boost: Math.round(r.boost * 10) / 10,
        reasons: r.reasons,
        reasonSentence: reasonSentence(r.reasons),
        daypart: r.daypart,
      },
    }));

    return NextResponse.json({
      pick: top[0] ?? null,
      alts: top.slice(1, 4),
      more: top.slice(4),
      context: {
        daypart: dp,
        daypartLabel: bias.label,
        hourLocal: reqCtx.hourLocal,
        timezone: reqCtx.timezone,
        city: reqCtx.city,
        weather: ambient.outdoorVibe,
        isDark: ambient.isDark,
        holiday: ambient.holiday,
        wildRubric: wild.rubric,
        keywordHints: wild.keywordHints,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
