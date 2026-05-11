// GET /api/daily-pick
//
// Returns the global Daily Bucket pick: one LLM-curated hero movie + 5 alts
// + a one-sentence caption. The pick is the SAME for every user in the same
// (country, services, hour_bucket, weather_bucket, weekday, holiday_flag)
// bucket. No per-user data ever enters the LLM prompt or the cache key.
//
// Query params (all optional, useful for cron pre-warming and debugging):
//   providers=netflix,max     // comma-separated provider keys
//   country=US                // ISO 3166-1 alpha-2; otherwise from edge headers
//   hour=20                   // local hour 0..23 (overrides edge)
//   weekday=5                 // 0=Sun..6=Sat (overrides edge)
//   weather=cozy              // override weather bucket
//   holiday=halloween         // override holiday flag
//   nocache=1                 // skip read+write of the in-memory cache

import { NextRequest, NextResponse } from "next/server";
import { discoverMovies, getMovieDetail, getMovieGenres } from "@/lib/tmdbClient";
import { buildMovieResult, primeGenreCache } from "@/lib/buildMovieResult";
import { selectedKeysToTmdbIds } from "@/lib/providers";
import { getRequestContext } from "@/lib/requestContext";
import { getAmbientContext, classifyWeatherBucket, type WeatherBucket } from "@/lib/ambientContext";
import { getCulturalContext, holidayFlag } from "@/lib/culturalContext";
import {
  classifyDaypart,
  classifyHourBucket,
  DAYPART_BIAS,
  type HourBucket,
} from "@/lib/daypart";
import { rankTop60, reasonSentence } from "@/lib/rerank";
import { getWildSignals, getTributeMovieIds } from "@/lib/wildSignals";
import { bucketKey, hashServices, getCached, setCached } from "@/lib/bucket";
import { pickHeroWithLlm, type LlmPick } from "@/lib/llmRerank";
import type { MovieResult } from "@/lib/types";

export const runtime = "nodejs";

interface DailyPickPayload {
  bucket: {
    key: string;
    country: string;
    servicesHash: string;
    hourBucket: HourBucket;
    weatherBucket: WeatherBucket;
    weekday: number;
    holidayFlag: string;
  };
  hero: (MovieResult & { caption: string }) | null;
  alts: MovieResult[];
  source: LlmPick["source"];
  context: {
    daypart: string;
    daypartLabel: string;
    weather: string;
    holiday: string | null;
  };
  cached: boolean;
  generatedAt: number;
}

function parseList(v: string | null): string[] {
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function parseIntInRange(v: string | null, lo: number, hi: number): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < lo || i > hi) return null;
  return i;
}

const VALID_WEATHER: WeatherBucket[] = ["cozy", "bright", "neutral", "unknown"];
const CANDIDATE_PAGES = 3;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const reqCtx = getRequestContext(req);

    const selectedKeys = parseList(sp.get("providers"));
    const tmdbProviderIds = selectedKeysToTmdbIds(selectedKeys);
    const servicesHash = hashServices(selectedKeys);

    const countryParam = (sp.get("country") ?? "").toUpperCase();
    const country = (countryParam || reqCtx.country || process.env.NEXT_PUBLIC_TMDB_REGION || "US").toUpperCase();

    const hourOverride = parseIntInRange(sp.get("hour"), 0, 23);
    const hourLocal = hourOverride ?? reqCtx.hourLocal;
    const hourBucket = classifyHourBucket(hourLocal);

    const weekdayOverride = parseIntInRange(sp.get("weekday"), 0, 6);
    const weekday = ((weekdayOverride ?? reqCtx.dayOfWeek) as 0 | 1 | 2 | 3 | 4 | 5 | 6);

    // Cultural + ambient (used by the underlying reranker + bucket key).
    const [ambient, cultural, wild] = await Promise.all([
      getAmbientContext({ lat: reqCtx.lat, lng: reqCtx.lng }),
      getCulturalContext(),
      getWildSignals(),
    ]);

    const weatherParam = (sp.get("weather") ?? "").toLowerCase();
    const weatherBucket: WeatherBucket = VALID_WEATHER.includes(weatherParam as WeatherBucket)
      ? (weatherParam as WeatherBucket)
      : classifyWeatherBucket(ambient.outdoorVibe);

    const holidayParam = sp.get("holiday");
    const holiday = holidayParam ?? holidayFlag(ambient.holiday, cultural);

    const key = bucketKey({
      country,
      servicesHash,
      hourBucket,
      weatherBucket,
      weekday,
      holidayFlag: holiday,
    });

    const noCache = sp.get("nocache") === "1";
    if (!noCache) {
      const hit = getCached<DailyPickPayload>(key);
      if (hit) {
        return NextResponse.json({ ...hit, cached: true });
      }
    }

    // ---------- Build candidates (mirrors /api/tonight) ----------
    const dp = classifyDaypart(hourLocal, weekday);
    const bias = DAYPART_BIAS[dp];

    const genres = await getMovieGenres().catch(() => []);
    primeGenreCache(genres);

    const onlyMine = selectedKeys.length > 0;
    const pages = await Promise.all(
      Array.from({ length: CANDIDATE_PAGES }, (_, i) =>
        discoverMovies({
          page: i + 1,
          sortBy: "vote_average.desc",
          voteCountGte: 800,
          voteAverageGte: 6.5 + (bias.ratingFloorBump ?? 0),
          watchRegion: country,
          watchProviderIds: onlyMine && tmdbProviderIds.length ? tmdbProviderIds : undefined,
          runtimeLte: bias.runtimePreference.max,
        }),
      ),
    );
    const candidates = pages.flatMap((p) => p.results);

    const tributeMovieIds = await getTributeMovieIds([
      ...wild.bornTodayIds,
      ...wild.diedTodayIds,
    ]);

    const ranked0 = [...candidates].sort((a, b) => b.popularity - a.popularity);
    const enrichTargets = ranked0.slice(0, 30).map((m) => m.id);
    const detailsSettled = await Promise.allSettled(enrichTargets.map((id) => getMovieDetail(id)));
    const detailById = new Map<number, Awaited<ReturnType<typeof getMovieDetail>>>();
    detailsSettled.forEach((r, i) => {
      if (r.status === "fulfilled") detailById.set(enrichTargets[i], r.value);
    });

    const results: MovieResult[] = await Promise.all(
      candidates.map(async (m) => {
        const detail = detailById.get(m.id);
        return buildMovieResult(m, {
          region: country,
          selectedProviderKeys: selectedKeys,
          imdbId: detail?.imdbId ?? null,
          runtime: detail?.runtime ?? null,
          genres: detail ? detail.genres.map((g) => g.name) : undefined,
          watchProvidersByRegion: detail?.watchProviders,
        });
      }),
    );

    const top = rankTop60({
      candidates: results,
      selectedProviderKeys: selectedKeys,
      hiddenIds: new Set<number>(),
      watchlistIds: new Set<number>(),
      hourLocal,
      dayOfWeek: weekday,
      ambient,
      cultural,
      locale: reqCtx.locale,
      wildGenreBoosts: wild.genreBoosts,
      wildKeywordHints: wild.keywordHints,
      tributeMovieIds,
    });

    if (!top.length) {
      const empty: DailyPickPayload = {
        bucket: { key, country, servicesHash, hourBucket, weatherBucket, weekday, holidayFlag: holiday },
        hero: null,
        alts: [],
        source: "fallback",
        context: {
          daypart: dp,
          daypartLabel: bias.label,
          weather: ambient.outdoorVibe,
          holiday: ambient.holiday,
        },
        cached: false,
        generatedAt: Date.now(),
      };
      if (!noCache) setCached(key, empty, 30 * 60 * 1000); // cache empties shorter
      return NextResponse.json(empty);
    }

    // ---------- LLM pick ----------
    const llm = await pickHeroWithLlm(
      {
        country,
        hourBucket,
        weatherBucket,
        weekday,
        holiday: ambient.holiday,
        daypartLabel: bias.label,
      },
      top,
    );

    const byId = new Map<number, MovieResult>(results.map((m) => [m.tmdbId, m]));
    const heroMovie = byId.get(llm.heroId) ?? top[0]?.movie ?? null;
    const altMovies: MovieResult[] = llm.altIds
      .map((id) => byId.get(id))
      .filter((m): m is MovieResult => Boolean(m));

    // Backfill alts if LLM under-delivered.
    if (altMovies.length < 5) {
      const seen = new Set<number>([heroMovie?.tmdbId ?? -1, ...altMovies.map((m) => m.tmdbId)]);
      for (const r of top) {
        if (altMovies.length >= 5) break;
        if (seen.has(r.movie.tmdbId)) continue;
        altMovies.push(r.movie);
        seen.add(r.movie.tmdbId);
      }
    }

    // Caption: prefer LLM, else generate from rerank reasons.
    const heroRanked = top.find((r) => r.movie.tmdbId === heroMovie?.tmdbId);
    const ruleCaption = heroRanked ? reasonSentence(heroRanked.reasons) : "";
    const caption = llm.caption || ruleCaption || "Tonight's pick.";

    const payload: DailyPickPayload = {
      bucket: { key, country, servicesHash, hourBucket, weatherBucket, weekday, holidayFlag: holiday },
      hero: heroMovie ? { ...heroMovie, caption } : null,
      alts: altMovies,
      source: llm.source,
      context: {
        daypart: dp,
        daypartLabel: bias.label,
        weather: ambient.outdoorVibe,
        holiday: ambient.holiday,
      },
      cached: false,
      generatedAt: Date.now(),
    };

    if (!noCache) setCached(key, payload);

    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
