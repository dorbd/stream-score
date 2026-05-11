import { NextRequest, NextResponse } from "next/server";
import { discoverMovies, getMovieDetail, getMovieGenres } from "@/lib/tmdbClient";
import { buildMovieResult, primeGenreCache } from "@/lib/buildMovieResult";
import { selectedKeysToTmdbIds } from "@/lib/providers";
import type { DiscoverResponse, TmdbDiscoverParams, TmdbMovieSummary } from "@/lib/types";

function parseList(v: string | null): string[] {
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function parseNum(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const SORT_MAP: Record<string, string> = {
  best: "vote_average.desc", // changed: use rating-sorted discovery (with vote_count floor) for "best"
  popular: "popularity.desc",
  imdb: "vote_average.desc",
  newest: "primary_release_date.desc",
  oldest: "primary_release_date.asc",
  runtime_asc: "runtime.asc",
  runtime_desc: "runtime.desc",
  rating: "vote_average.desc",
};

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const region = (process.env.NEXT_PUBLIC_TMDB_REGION || "US").toUpperCase();
    const selectedKeys = parseList(sp.get("providers"));
    const tmdbProviderIds = selectedKeysToTmdbIds(selectedKeys);
    const includeOnlyMine = sp.get("only_mine") === "true";
    const sortKey = sp.get("sort") || "best";
    const sortBy = SORT_MAP[sortKey] || "vote_average.desc";
    const genreIds = parseList(sp.get("genres"))
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    const yearGte = parseNum(sp.get("year_min"));
    const yearLte = parseNum(sp.get("year_max"));
    const runtimeGte = parseNum(sp.get("runtime_min"));
    const runtimeLte = parseNum(sp.get("runtime_max"));
    const voteAverageGte = parseNum(sp.get("rating_min"));
    const language = sp.get("lang") || undefined;
    const page = parseNum(sp.get("page")) ?? 1;
    const query = sp.get("q")?.trim() || undefined;
    const hiddenIds = new Set(parseList(sp.get("hide")).map((s) => Number(s)).filter(Boolean));
    const watchProviderIds = includeOnlyMine && tmdbProviderIds.length ? tmdbProviderIds : undefined;

    // Pre-load genre catalogue so cards always show genre names even when we skip detail fetches.
    const genres = await getMovieGenres().catch(() => []);
    primeGenreCache(genres);

    const baseParams: TmdbDiscoverParams = {
      sortBy,
      genreIds: genreIds.length ? genreIds : undefined,
      yearGte,
      yearLte,
      runtimeGte,
      runtimeLte,
      voteAverageGte: voteAverageGte ?? (sortKey === "best" ? 6 : undefined),
      voteCountGte: sortKey === "best" ? 500 : 50,
      originalLanguage: language,
      watchRegion: region,
      watchProviderIds,
      query,
    };

    const discovered = await discoverMovies({ ...baseParams, page });

    // Filter hidden, dedupe.
    const summaries: TmdbMovieSummary[] = discovered.results.filter(
      (m) => !hiddenIds.has(m.id),
    );

    // Only enrich with OMDb when the user is looking at the first page AND we're
    // sorted by combined-score-like sorts. For deep pagination or other sorts,
    // we skip OMDb to stay cheap.
    const wantOmdb = page === 1 && (sortKey === "best" || sortKey === "imdb");
    const enrichedCount = wantOmdb ? Math.min(summaries.length, PAGE_SIZE) : 0;

    // For enriched rows, fetch details (for imdbId + runtime + watch providers).
    const detailsSettled = await Promise.allSettled(
      summaries.slice(0, enrichedCount).map((m) => getMovieDetail(m.id)),
    );

    const results = await Promise.all(
      summaries.map(async (m, i) => {
        const settled = i < enrichedCount ? detailsSettled[i] : null;
        const detail = settled?.status === "fulfilled" ? settled.value : null;
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

    // Final ordering: by combined score (if computed) with availability as tiebreaker.
    if (sortKey === "best") {
      const userKeys = new Set(selectedKeys);
      results.sort((a, b) => {
        const av = a.ratings.combined ?? a.ratings.audience ?? -1;
        const bv = b.ratings.combined ?? b.ratings.audience ?? -1;
        if (bv !== av) return bv - av;
        // Tiebreak: movies on the user's services win.
        const aOn = a.availability.flatrate.some((p) => userKeys.has(p.key)) ? 1 : 0;
        const bOn = b.availability.flatrate.some((p) => userKeys.has(p.key)) ? 1 : 0;
        if (bOn !== aOn) return bOn - aOn;
        return (b.year ?? 0) - (a.year ?? 0);
      });
    }

    const body: DiscoverResponse = {
      results,
      page: discovered.page,
      totalPages: discovered.totalPages,
      totalResults: discovered.totalResults,
    };
    return NextResponse.json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
