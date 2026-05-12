// computeVector(answers, opts) — pure-function reducer from Answers → 7-vec.
//
// Algorithm (matches design spec):
//   1. For each answered question q, add `loadings[q].a` or `loadings[q].b`
//      to the running sum. `"skip"` adds the zero vector.
//   2. Normalize the running sum by sqrt(n_nonskip) so a respondent who
//      answers more questions doesn't get a runaway-magnitude vector.
//   3. If the lie detector tripped, multiply by `lieDetectorFlags.downweight`.
//   4. If a TV-watch-history loading is provided, add 0.5 × that vector.
//   5. Clamp every axis to [-2, +2].
//   6. L2-normalize to a unit vector so all downstream math (cosine) is sane.
//
// All math is plain Number arithmetic, no external libs.

import type {
  Answers,
  Loadings,
  Vector7,
  LieDetectorFlags,
} from "./types";
import { AXES } from "./types";

export const VECTOR_DIM = AXES.length; // 7
const AXIS_CLAMP = 2;

export interface ScoreOptions {
  loadings: Loadings;
  /** When set + detected, the final vector is scaled by `downweight`. */
  lieDetectorFlags?: LieDetectorFlags;
  /** Optional 7-vec from the user's TV history (Agent 5), weighted 0.5×. */
  tvLoading?: Vector7;
}

/** Allocate a zero-filled 7-vector. */
export function zeroVector(): Vector7 {
  return new Array(VECTOR_DIM).fill(0);
}

/** Add `b` into `a` in place; returns `a` for convenience. */
function addInto(a: Vector7, b: Vector7): Vector7 {
  for (let i = 0; i < VECTOR_DIM; i++) {
    a[i] += b[i] ?? 0;
  }
  return a;
}

/** Multiply every component of `v` by `s` in place. */
function scaleInto(v: Vector7, s: number): Vector7 {
  for (let i = 0; i < VECTOR_DIM; i++) v[i] *= s;
  return v;
}

/** Clamp each axis of `v` into [-limit, +limit] in place. */
function clampInto(v: Vector7, limit: number): Vector7 {
  for (let i = 0; i < VECTOR_DIM; i++) {
    if (v[i] > limit) v[i] = limit;
    else if (v[i] < -limit) v[i] = -limit;
  }
  return v;
}

/** L2 norm; returns 0 for the zero vector. */
export function l2(v: Vector7): number {
  let s = 0;
  for (let i = 0; i < VECTOR_DIM; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

/** Return a new vector that is `v` scaled to unit length, or zero if |v| = 0. */
export function unit(v: Vector7): Vector7 {
  const n = l2(v);
  if (n === 0) return zeroVector();
  const out = new Array(VECTOR_DIM);
  for (let i = 0; i < VECTOR_DIM; i++) out[i] = v[i] / n;
  return out;
}

/** Cosine similarity; safe for zero vectors (returns 0). */
export function cosineSim(a: Vector7, b: Vector7): number {
  const na = l2(a);
  const nb = l2(b);
  if (na === 0 || nb === 0) return 0;
  let dot = 0;
  for (let i = 0; i < VECTOR_DIM; i++) dot += a[i] * b[i];
  return dot / (na * nb);
}

/**
 * Reduce an answer map into a normalized 7-vector in taste space.
 *
 * Caller is responsible for computing `lieDetectorFlags` (via `detectLie`) and
 * for sourcing `tvLoading` separately; this function performs no IO.
 */
export function computeVector(answers: Answers, opts: ScoreOptions): Vector7 {
  const sum = zeroVector();
  let nNonSkip = 0;

  for (const qid of Object.keys(answers)) {
    const ans = answers[qid];
    if (ans === "skip") continue;
    const ql = opts.loadings.loadings[qid];
    if (!ql) continue; // unknown question id — ignore defensively
    const pole = ans === "a" ? ql.a : ql.b;
    if (!pole || pole.length !== VECTOR_DIM) continue;
    addInto(sum, pole);
    nNonSkip++;
  }

  // Step 2: normalize by sqrt(n) so vector magnitude is roughly stable
  // regardless of how many questions were answered.
  if (nNonSkip > 0) {
    scaleInto(sum, 1 / Math.sqrt(nNonSkip));
  }

  // Step 3: lie-detector downweight.
  if (opts.lieDetectorFlags?.detected) {
    scaleInto(sum, opts.lieDetectorFlags.downweight);
  }

  // Step 4: optional TV history nudge.
  if (opts.tvLoading && opts.tvLoading.length === VECTOR_DIM) {
    for (let i = 0; i < VECTOR_DIM; i++) {
      sum[i] += 0.5 * opts.tvLoading[i];
    }
  }

  // Step 5: clamp.
  clampInto(sum, AXIS_CLAMP);

  // Step 6: L2-normalize for cosine math downstream.
  return unit(sum);
}

/**
 * Convenience helper: count non-skip answers. Useful for callers that want to
 * gate UI on enough signal before showing a verdict.
 */
export function countAnswered(answers: Answers): number {
  let n = 0;
  for (const k of Object.keys(answers)) if (answers[k] !== "skip") n++;
  return n;
}
