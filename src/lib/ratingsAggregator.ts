// Combine ratings from multiple sources into a single 0..100 score.
// Missing scores are skipped — the weighted average only uses what's available.
// Per PM review: the provider-availability boost has been removed from the
// score itself (mixing preference into the rating made the number lie).
// Availability is now used as a sort tiebreaker downstream.

import type { AggregatedRatings, OmdbRatings } from "./types";

interface CombineInput {
  tmdbVoteAverage: number; // 0..10
  tmdbVoteCount: number;
  omdb: OmdbRatings | null;
  /** "critics" boosts RT+Meta, "audience" boosts IMDb+audience, "balanced" is default. */
  weightProfile?: "balanced" | "critics" | "audience";
}

const WEIGHTS = {
  balanced: { imdb: 0.3, rottenTomatoes: 0.3, metacritic: 0.2, audience: 0.2 },
  critics:  { imdb: 0.15, rottenTomatoes: 0.45, metacritic: 0.3, audience: 0.1 },
  audience: { imdb: 0.45, rottenTomatoes: 0.15, metacritic: 0.1, audience: 0.3 },
} as const;

const MIN_VOTE_COUNT_FOR_AUDIENCE = 100;

export function combineRatings(input: CombineInput): AggregatedRatings {
  const weights = WEIGHTS[input.weightProfile ?? "balanced"];

  const imdb =
    input.omdb?.imdbRating != null
      ? Math.max(0, Math.min(100, input.omdb.imdbRating * 10))
      : null;
  const rt = input.omdb?.rottenTomatoes ?? null;
  const meta = input.omdb?.metacritic ?? null;
  const audience =
    input.tmdbVoteCount >= MIN_VOTE_COUNT_FOR_AUDIENCE && input.tmdbVoteAverage > 0
      ? Math.max(0, Math.min(100, input.tmdbVoteAverage * 10))
      : null;

  const parts: { value: number; weight: number; key: keyof typeof weights }[] = [];
  if (imdb != null) parts.push({ value: imdb, weight: weights.imdb, key: "imdb" });
  if (rt != null) parts.push({ value: rt, weight: weights.rottenTomatoes, key: "rottenTomatoes" });
  if (meta != null) parts.push({ value: meta, weight: weights.metacritic, key: "metacritic" });
  if (audience != null) parts.push({ value: audience, weight: weights.audience, key: "audience" });

  let combined: number | null = null;
  if (parts.length > 0) {
    const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
    combined = parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight;
    combined = Math.round(combined * 10) / 10;
  }

  return {
    imdb: imdb != null ? Math.round(imdb * 10) / 10 : null,
    rottenTomatoes: rt,
    metacritic: meta,
    audience: audience != null ? Math.round(audience * 10) / 10 : null,
    combined,
    providerBoost: 0, // legacy field — kept for type compat, no longer applied to score
    available: parts.map((p) => p.key),
  };
}
