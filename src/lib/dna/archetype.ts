// assignArchetype(vector, archetypes) — cosine-similarity matcher + softmax.
//
// Given a user's normalized 7-vec and the bank of archetype centroids,
// returns the top-1 / top-2 archetypes plus a confidence score in [0, 1]
// reflecting how clearly top1 beat top2.
//
// Algorithm:
//   1. score_i = cosine_similarity(vector, archetype[i].centroid)
//   2. softmax over scores with temperature T = 0.5
//   3. top1 = argmax, top2 = second-highest
//   4. confidence = clamp((softmax_top1 - softmax_top2) / 0.4, 0, 1)
//
// The softmax probabilities are what we expose as `score` in `topN`, so the
// UI can rank "you also lean toward..." entries cleanly.

import { cosineSim } from "./score";
import type {
  Archetype,
  ArchetypeAssignment,
  ArchetypeScore,
  Vector7,
} from "./types";

const SOFTMAX_TEMPERATURE = 0.5;
const CONFIDENCE_DENOM = 0.4;

/** Per the spec: >14 skips out of 18 = not enough signal to trust the result. */
export const LOW_SIGNAL_SKIP_THRESHOLD = 14;

/**
 * Numerically-stable softmax over a list of scores at the given temperature.
 * Higher T → flatter distribution. T = 0.5 makes confident hits stand out.
 */
function softmax(scores: number[], temperature: number): number[] {
  if (scores.length === 0) return [];
  // Stability trick: subtract max before exp.
  let max = -Infinity;
  for (const s of scores) if (s > max) max = s;
  const exps = scores.map((s) => Math.exp((s - max) / temperature));
  let sum = 0;
  for (const e of exps) sum += e;
  if (sum === 0) return scores.map(() => 1 / scores.length);
  return exps.map((e) => e / sum);
}

export interface AssignArchetypeOptions {
  /**
   * Number of `"skip"` answers the user used. When over
   * `LOW_SIGNAL_SKIP_THRESHOLD`, the result is tagged `lowSignal: true` so
   * the UI can soften the verdict copy.
   */
  skipCount?: number;
}

/**
 * Match a normalized taste vector against a bank of archetype centroids.
 *
 * Returns top1/top2, a `confidence` in [0, 1], and a fully-ranked `topN` so
 * the UI can render "you also lean toward..." accents.
 */
export function assignArchetype(
  vector: Vector7,
  archetypes: Archetype[],
  opts: AssignArchetypeOptions = {},
): ArchetypeAssignment {
  if (archetypes.length === 0) {
    throw new Error("assignArchetype: archetypes list is empty");
  }

  const rawCos = archetypes.map((a) => cosineSim(vector, a.centroid));
  const probs = softmax(rawCos, SOFTMAX_TEMPERATURE);

  const ranked: ArchetypeScore[] = archetypes
    .map((archetype, i) => ({
      archetype,
      score: probs[i],
      rawCosine: rawCos[i],
    }))
    .sort((x, y) => y.score - x.score);

  const top1 = ranked[0];
  const top2 = ranked[1] ?? ranked[0];

  // Confidence: how clearly does top1 beat top2 in softmax space?
  const gap = top1.score - top2.score;
  const confidence = Math.max(0, Math.min(1, gap / CONFIDENCE_DENOM));

  const lowSignal =
    typeof opts.skipCount === "number" && opts.skipCount > LOW_SIGNAL_SKIP_THRESHOLD;

  return {
    top1: top1.archetype,
    top2: top2.archetype,
    confidence,
    topN: ranked,
    ...(lowSignal ? { lowSignal: true } : {}),
  };
}
