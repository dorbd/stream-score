// Stage-2 reranker. Combines provider match, daypart fit, weather fit,
// trending lift, and anniversary pulse into a bounded boost on top of the
// existing combined IMDb/RT/Meta score. Emits per-movie "why" reasons.

import { classifyDaypart, daypartFitScore, DAYPART_BIAS, type DaypartKey } from "./daypart";
import { weatherFitScore, type AmbientContext } from "./ambientContext";
import { trendingScoreFor, type CulturalContext } from "./culturalContext";
import type { MovieResult } from "./types";

export interface RerankInput {
  candidates: MovieResult[];
  selectedProviderKeys: string[];
  hiddenIds: Set<number>;
  watchlistIds: Set<number>;
  hourLocal: number;
  dayOfWeek: number;
  ambient: AmbientContext;
  cultural: CulturalContext;
  locale: string;
  /** TMDb genre id -> [0,1] bump from wild signals (history, NASA, etc.). */
  wildGenreBoosts?: Record<number, number>;
  /** Lower-cased keywords; movies whose overview matches get a small bonus. */
  wildKeywordHints?: string[];
  /** TMDb movie ids tied to a person born/died today — tribute boost. */
  tributeMovieIds?: Set<number>;
}

export interface Reason {
  key: string;
  magnitude: number;
  phrase: string;
}

export interface RankedMovie {
  movie: MovieResult;
  base: number;
  boost: number;
  finalScore: number;
  daypart: DaypartKey;
  reasons: Reason[];
}

const W = {
  provider: 8,
  daypart: 4,
  weather: 3,
  trending: 3,
  anniversary: 2,
  locale: 2,
  wildGenre: 3,
  wildKeyword: 2,
  tribute: 4,
} as const;

const BOOST_CAP = 15;
const VOTE_FLOOR = 300;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

const HOLIDAY_PHRASE: Record<string, string> = {
  halloween: "perfect Halloween-week pick",
  christmas: "Christmas-season favorite",
  valentines: "Valentine's-week pick",
  pride: "Pride-month pick",
  "independence-day": "July 4th pick",
  "new-year": "ring-in-the-new-year pick",
  thanksgiving: "Thanksgiving-week pick",
  "mothers-day": "Mother's Day pick",
  "fathers-day": "Father's Day pick",
};

function providerMatchScore(m: MovieResult, selected: Set<string>): { score: number; name?: string } {
  if (!selected.size) return { score: 0 };
  for (const p of m.availability.flatrate) {
    if (selected.has(p.key)) return { score: 1, name: p.name };
  }
  if (m.availability.rent.length || m.availability.buy.length) return { score: 0.25 };
  return { score: 0 };
}

function genreIdsFromNames(_genres: string[]): number[] {
  // Movie genres on MovieResult are names; we don't have ids cheaply here.
  // The fit functions accept numeric ids — but the discover route stored TMDb genre_ids
  // before mapping to names. For now we map back from names to common ids.
  return _genres.map((g) => GENRE_NAME_TO_ID[g] ?? 0).filter((n) => n);
}

const GENRE_NAME_TO_ID: Record<string, number> = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80,
  Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36,
  Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749, "Science Fiction": 878,
  Thriller: 53, "TV Movie": 10770, War: 10752, Western: 37,
};

export function rerank(input: RerankInput): RankedMovie[] {
  const selected = new Set(input.selectedProviderKeys);
  const coldStart = selected.size === 0;
  const dp = classifyDaypart(input.hourLocal, input.dayOfWeek);

  const wProvider = coldStart ? 0 : W.provider;
  const wTrending = coldStart ? W.trending + 2 : W.trending;
  const wDaypart = coldStart ? W.daypart + 1 : W.daypart;

  const ranked: RankedMovie[] = input.candidates
    .filter((m) => !input.hiddenIds.has(m.tmdbId))
    .map((m) => {
      const base = m.ratings.combined ?? m.ratings.audience ?? 50;
      const genreIds = genreIdsFromNames(m.genres);

      const pm = providerMatchScore(m, selected);
      const dpFit = daypartFitScore(genreIds, dp, m.runtime ?? null);
      const wxFit = weatherFitScore(genreIds, input.ambient);
      const trend = trendingScoreFor(m.tmdbId, input.cultural);
      const ann = input.cultural.anniversaryIds.has(m.tmdbId) ? 1 : 0;
      const localeFit =
        m.originalLanguage && input.locale.split("-")[0]?.toLowerCase() === m.originalLanguage.toLowerCase()
          ? 0.5
          : 0;
      const watchlistBoost = input.watchlistIds.has(m.tmdbId) ? 0.5 : 0;

      // Wild signals
      let wildGenre = 0;
      if (input.wildGenreBoosts) {
        for (const gid of genreIds) {
          wildGenre = Math.max(wildGenre, input.wildGenreBoosts[gid] ?? 0);
        }
      }
      let wildKeyword = 0;
      if (input.wildKeywordHints?.length && m.overview) {
        const ov = m.overview.toLowerCase();
        const matched = input.wildKeywordHints.filter((k) => ov.includes(k));
        if (matched.length > 0) wildKeyword = Math.min(1, 0.4 + 0.2 * (matched.length - 1));
      }
      const tribute = input.tributeMovieIds?.has(m.tmdbId) ? 1 : 0;

      const raw =
        wProvider * pm.score +
        wDaypart * dpFit +
        W.weather * wxFit +
        wTrending * trend +
        W.anniversary * ann +
        W.locale * localeFit +
        W.wildGenre * wildGenre +
        W.wildKeyword * wildKeyword +
        W.tribute * tribute +
        watchlistBoost;

      const boost = clamp(raw, -BOOST_CAP, BOOST_CAP);
      const finalScore = clamp(base + boost, 0, 100);

      const reasons: Reason[] = [];
      const push = (key: string, magnitude: number, phrase: string) => {
        if (Math.abs(magnitude) >= 0.4) reasons.push({ key, magnitude, phrase });
      };
      if (base >= 85) push("quality", 2, "critically acclaimed");
      else if (base >= 75) push("quality", 1, "very well reviewed");
      if (pm.score >= 1 && pm.name) push("provider", wProvider * pm.score, `streaming on ${pm.name}`);
      if (dpFit >= 0.4) push("daypart", wDaypart * dpFit, `fits a ${DAYPART_BIAS[dp].label}`);
      if (input.ambient.holiday && HOLIDAY_PHRASE[input.ambient.holiday]) {
        if (wxFit >= 0.4) push("holiday", W.weather * wxFit, HOLIDAY_PHRASE[input.ambient.holiday]);
      } else if (wxFit >= 0.4) {
        const v = input.ambient.outdoorVibe;
        const phrase =
          v === "rainy-cold"
            ? "perfect for a rainy night"
            : v === "stormy"
              ? "great with a storm rolling in"
              : v === "snowy"
                ? "snowed-in pick"
                : v === "foggy"
                  ? "perfect when it's foggy"
                  : v === "hot-clear"
                    ? "matches a warm clear evening"
                    : "matches tonight's vibe";
        push("weather", W.weather * wxFit, phrase);
      }
      if (trend >= 0.5) push("trending", wTrending * trend, "trending right now");
      if (ann) {
        const years = input.cultural.anniversaryByMovieYears.get(m.tmdbId);
        push("anniversary", W.anniversary, years ? `${years}-year anniversary today` : "anniversary today");
      }
      if (watchlistBoost) push("watchlist", watchlistBoost, "in your watchlist");
      if (tribute) push("tribute", W.tribute, "tribute pick for someone born or remembered today");
      if (wildGenre >= 0.4) push("wild", W.wildGenre * wildGenre, "matches today's vibe in the news");
      else if (wildKeyword >= 0.4) push("wild", W.wildKeyword * wildKeyword, "echoes something happening today");
      reasons.sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude));
      return { movie: m, base, boost, finalScore, daypart: dp, reasons: reasons.slice(0, 3) };
    })
    .filter((r) => (r.movie.ratings.combined ?? r.movie.ratings.audience ?? 0) > 0); // drop unrated

  // Sort: finalScore desc, with tiebreakers
  ranked.sort((a, b) => {
    if (Math.abs(b.finalScore - a.finalScore) > 0.5) return b.finalScore - a.finalScore;
    const ap = a.movie.availability.flatrate.some((p) => selected.has(p.key)) ? 1 : 0;
    const bp = b.movie.availability.flatrate.some((p) => selected.has(p.key)) ? 1 : 0;
    if (bp !== ap) return bp - ap;
    return (b.movie.year ?? 0) - (a.movie.year ?? 0);
  });

  return ranked;
}

export function reasonSentence(reasons: Reason[]): string {
  if (!reasons.length) return "";
  const phrases = reasons.map((r) => r.phrase);
  if (phrases.length === 1) return capitalize(phrases[0]) + ".";
  if (phrases.length === 2) return capitalize(phrases[0]) + " and " + phrases[1] + ".";
  return capitalize(phrases[0]) + ", " + phrases[1] + ", and " + phrases[2] + ".";
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export { VOTE_FLOOR };

/**
 * Thin wrapper around `rerank` that returns the top-60 candidates with their
 * reasons attached. This is the input the LLM reranker uses to pick a hero
 * and write a caption. Does not change the scoring weights — same `rerank`
 * pipeline, just sliced.
 */
export function rankTop60(input: RerankInput): RankedMovie[] {
  return rerank(input).slice(0, 60);
}
