// Cheap, deterministic per-movie DNA profile inferred from TMDb metadata.
//
// Sign convention (matches src/lib/dna/types.ts AXES):
//   index 0 prestigePopcorn   +1 = prestige  / -1 = popcorn
//   index 1 modernClassic     +1 = modern    / -1 = classic
//   index 2 lightDark         +1 = light     / -1 = dark
//   index 3 realityFantasy    +1 = reality   / -1 = fantasy
//   index 4 slowKinetic       +1 = slow      / -1 = kinetic
//   index 5 soloCommunal      +1 = solo      / -1 = communal
//   index 6 familiarForeign   +1 = familiar  / -1 = foreign
//
// This file is the rule-based fallback used inline on every request. An offline
// LLM ingest script (scripts/ingest/embed-movies.ts) can override per-movie
// vectors with richer signal via data/dna/movie-profiles.json.
//
// Output: number[7] clipped to [-1, +1].

/** TMDb genre id → loading row, in axis order. */
const GENRE_LOADINGS: Record<number, number[]> = {
  28:    [-0.6,  0.2,  0.2, -0.2, -0.7,  0.0,  0.1],  // Action
  12:    [-0.3,  0.1,  0.3, -0.4, -0.4,  0.0,  0.2],  // Adventure
  16:    [-0.1,  0.3,  0.6, -0.7, -0.1, -0.3,  0.0],  // Animation
  35:    [-0.4,  0.0,  0.7,  0.3, -0.2, -0.4,  0.3],  // Comedy
  80:    [ 0.4, -0.1, -0.6,  0.5, -0.1, -0.1,  0.0],  // Crime
  99:    [ 0.7,  0.2,  0.0,  0.9,  0.2,  0.5,  0.0],  // Documentary
  18:    [ 0.6,  0.0, -0.4,  0.6,  0.4,  0.4,  0.0],  // Drama
  10751: [-0.3,  0.0,  0.9, -0.2, -0.1, -0.6,  0.5],  // Family
  14:    [-0.2,  0.0,  0.4, -0.9, -0.2, -0.1,  0.0],  // Fantasy
  36:    [ 0.5, -0.7, -0.1,  0.7,  0.3,  0.1,  0.0],  // History
  27:    [-0.1,  0.0, -0.9, -0.1, -0.3,  0.0,  0.0],  // Horror
  10402: [ 0.2,  0.0,  0.5,  0.0, -0.2, -0.5,  0.2],  // Music
  9648:  [ 0.3,  0.0, -0.5,  0.2,  0.5,  0.5,  0.0],  // Mystery
  10749: [ 0.1,  0.0,  0.6,  0.4,  0.3, -0.2,  0.2],  // Romance
  878:   [ 0.2,  0.3, -0.1, -0.8, -0.2,  0.0,  0.0],  // Science Fiction
  53:    [-0.1,  0.1, -0.7,  0.4, -0.3,  0.2,  0.0],  // Thriller
  10752: [ 0.6, -0.4, -0.5,  0.7,  0.2, -0.3,  0.1],  // War
  37:    [ 0.1, -0.7, -0.2,  0.4,  0.0,  0.1,  0.2],  // Western
};

const GENRE_WEIGHT = 0.6;

export interface MovieProfileInput {
  genreIds?: number[] | null;
  runtime?: number | null;
  year?: number | null;
  originalLanguage?: string | null;
}

/**
 * Compute a 7-dim DNA profile vector for a movie using its TMDb metadata.
 * All inputs are optional; missing data degrades signal but never throws.
 */
export function computeMovieDnaProfile(input: MovieProfileInput): number[] {
  const v = [0, 0, 0, 0, 0, 0, 0];

  // Sum genre loadings, weighted.
  const ids = input.genreIds ?? [];
  for (const gid of ids) {
    const row = GENRE_LOADINGS[gid];
    if (!row) continue;
    for (let i = 0; i < 7; i++) v[i] += row[i] * GENRE_WEIGHT;
  }

  // Year axis (modernClassic): pre-1985 = classic, 2018+ = modern, else linear.
  if (typeof input.year === "number" && Number.isFinite(input.year)) {
    if (input.year < 1985) v[1] += -0.8;
    else if (input.year >= 2018) v[1] += 0.6;
    else v[1] += (input.year - 2000) / 36;
  }

  // Runtime axis (slowKinetic).
  if (typeof input.runtime === "number" && input.runtime > 0) {
    if (input.runtime > 150) v[4] += 0.4;
    else if (input.runtime < 95) v[4] += -0.3;
  }

  // Language axis (familiarForeign). English-language assumed "familiar" for now.
  if (input.originalLanguage) {
    if (input.originalLanguage.toLowerCase() === "en") v[6] += 0.2;
    else v[6] += -0.7;
  }

  // Clip to [-1, +1].
  for (let i = 0; i < 7; i++) {
    if (v[i] > 1) v[i] = 1;
    else if (v[i] < -1) v[i] = -1;
  }
  return v;
}

/** Re-exported for downstream consumers (LLM ingest cache + tests). */
export const MOVIE_GENRE_LOADINGS = GENRE_LOADINGS;
