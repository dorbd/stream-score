// External cultural signal: TMDb trending + same-day-of-year anniversaries.

interface TmdbResults {
  results: { id: number; vote_count?: number }[];
}

export interface CulturalContext {
  trendingDay: Set<number>;
  trendingWeek: Set<number>;
  anniversaryIds: Set<number>;
  anniversaryByMovieYears: Map<number, number>; // tmdbId -> years (10/20/25/50)
}

const BASE = "https://api.themoviedb.org/3";

async function tmdb(path: string, query?: Record<string, string>): Promise<TmdbResults | null> {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  const url = new URL(BASE + path);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "en-US");
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
    if (!res.ok) return null;
    return (await res.json()) as TmdbResults;
  } catch {
    return null;
  }
}

export async function getCulturalContext(): Promise<CulturalContext> {
  const today = new Date();
  const mmdd = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const yearsBack = [10, 20, 25, 50];

  const [day, week, ...anniversaries] = await Promise.all([
    tmdb("/trending/movie/day"),
    tmdb("/trending/movie/week"),
    ...yearsBack.map((y) =>
      tmdb("/discover/movie", {
        "primary_release_date.gte": `${today.getFullYear() - y}-${mmdd}`,
        "primary_release_date.lte": `${today.getFullYear() - y}-${mmdd}`,
        "vote_count.gte": "1000",
        sort_by: "vote_average.desc",
      }),
    ),
  ]);

  const trendingDay = new Set<number>((day?.results ?? []).map((m) => m.id));
  const trendingWeek = new Set<number>((week?.results ?? []).map((m) => m.id));
  const annIds = new Set<number>();
  const annYears = new Map<number, number>();
  anniversaries.forEach((r, i) => {
    const years = yearsBack[i];
    for (const m of r?.results ?? []) {
      if (!annIds.has(m.id)) {
        annIds.add(m.id);
        annYears.set(m.id, years);
      }
    }
  });

  return { trendingDay, trendingWeek, anniversaryIds: annIds, anniversaryByMovieYears: annYears };
}

export function trendingScoreFor(id: number, cc: CulturalContext): number {
  const day = cc.trendingDay.has(id) ? 1 : 0;
  const week = cc.trendingWeek.has(id) ? 1 : 0;
  if (day && week) return 1;
  if (day) return 0.7;
  if (week) return 0.5;
  return 0;
}

/**
 * Compact "holiday flag" used in the Daily Bucket cache key. Combines the soft
 * holiday window with an "anniversary day" flag so the bucket key reflects
 * whether anything anniversary-worthy is happening today.
 */
export function holidayFlag(
  holiday: string | null,
  cultural?: { anniversaryIds: Set<number> },
): string {
  const base = holiday ?? "none";
  if (cultural && cultural.anniversaryIds.size > 0) return `${base}+anni`;
  return base;
}
