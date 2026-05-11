// 8-dim per-user taste vector with a per-dimension Kalman-style update.
// Stored in localStorage as base64-encoded Float32Array (8 means + 8
// variances = 64 bytes raw, ~88 bytes base64). Pure functions only —
// no React, no UI, no fetch.

// Ordering MUST match `AnchorFingerprint` in `anchor.ts`.
export const TASTE_DIMS = [
  "pace",
  "tone",
  "density",
  "palette",
  "era",
  "auteur",
  "runtime",
  "weirdness",
] as const;
export type TasteDim = (typeof TASTE_DIMS)[number];

export const TASTE_STORAGE_KEY = "taste";
const N = TASTE_DIMS.length;

// State layout: Float32Array(2*N) = [m0..m7, v0..v7].
// `m` is the current estimate of the user's preference center (0..1).
// `v` is the per-dim variance — shrinks over time as we accumulate evidence.

const PRIOR_MEAN = 0.5;
const PRIOR_VAR = 0.25; // wide-ish prior; we know nothing.
const OBS_VAR_DISMISS = 0.18; // dismissal is noisy signal
const OBS_VAR_WATCHLIST = 0.08; // watchlist is stronger signal
const MIN_VAR = 0.01; // never collapse fully — keep some exploration room.

export interface TasteVector {
  means: Float32Array; // length N
  variances: Float32Array; // length N
}

export type TasteObservation =
  | { type: "dismiss"; fingerprint: Partial<Record<TasteDim, number>> }
  | { type: "watchlist"; fingerprint: Partial<Record<TasteDim, number>> };

export function priorTaste(): TasteVector {
  const means = new Float32Array(N);
  const variances = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    means[i] = PRIOR_MEAN;
    variances[i] = PRIOR_VAR;
  }
  return { means, variances };
}

// Kalman scalar update:
//   K = v / (v + r)
//   m' = m + K * (z - m)   (dismiss: pull AWAY from z; we model "anti-z")
//   v' = (1 - K) * v
// For dismissals we update toward the *opposite* of the observation,
// i.e. z_eff = 1 - z, with higher obs variance (noisier).
// For watchlist we update toward z directly with lower obs variance.
export function applyObservation(
  state: TasteVector,
  obs: TasteObservation,
): TasteVector {
  const means = new Float32Array(state.means);
  const variances = new Float32Array(state.variances);
  const r = obs.type === "watchlist" ? OBS_VAR_WATCHLIST : OBS_VAR_DISMISS;
  for (let i = 0; i < N; i++) {
    const dim = TASTE_DIMS[i];
    const raw = obs.fingerprint[dim];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const z = obs.type === "watchlist" ? raw : 1 - raw;
    const v = variances[i];
    const K = v / (v + r);
    means[i] = clamp01(means[i] + K * (z - means[i]));
    variances[i] = Math.max(MIN_VAR, (1 - K) * v);
  }
  return { means, variances };
}

// ---- Distance & scoring ----

export function tasteDistance(
  taste: TasteVector,
  fingerprint: Partial<Record<TasteDim, number>>,
): number {
  // Variance-weighted euclidean distance: dimensions we're confident about
  // (low variance) count more.
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < N; i++) {
    const dim = TASTE_DIMS[i];
    const f = fingerprint[dim];
    if (typeof f !== "number" || !Number.isFinite(f)) continue;
    const w = 1 / Math.max(taste.variances[i], MIN_VAR);
    const d = taste.means[i] - f;
    sum += w * d * d;
    weight += w;
  }
  if (weight === 0) return 0;
  return Math.sqrt(sum / weight);
}

// ---- Serialization (base64 of Float32) ----

export function serializeTaste(state: TasteVector): string {
  const buf = new Float32Array(2 * N);
  buf.set(state.means, 0);
  buf.set(state.variances, N);
  return toBase64(new Uint8Array(buf.buffer));
}

export function deserializeTaste(s: string): TasteVector | null {
  try {
    const bytes = fromBase64(s);
    if (bytes.byteLength !== 2 * N * 4) return null;
    const f = new Float32Array(bytes.buffer, bytes.byteOffset, 2 * N);
    const means = new Float32Array(f.subarray(0, N));
    const variances = new Float32Array(f.subarray(N, 2 * N));
    for (let i = 0; i < N; i++) {
      if (!Number.isFinite(means[i]) || !Number.isFinite(variances[i])) return null;
    }
    return { means, variances };
  } catch {
    return null;
  }
}

// ---- localStorage helpers (pure-ish; SSR-safe) ----

export function loadTaste(): TasteVector {
  if (typeof window === "undefined") return priorTaste();
  try {
    const raw = window.localStorage.getItem(TASTE_STORAGE_KEY);
    if (!raw) return priorTaste();
    return deserializeTaste(raw) ?? priorTaste();
  } catch {
    return priorTaste();
  }
}

export function saveTaste(state: TasteVector): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TASTE_STORAGE_KEY, serializeTaste(state));
  } catch {
    // localStorage full / disabled — silently no-op.
  }
}

export function recordObservation(obs: TasteObservation): TasteVector {
  const next = applyObservation(loadTaste(), obs);
  saveTaste(next);
  return next;
}

export function resetTaste(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TASTE_STORAGE_KEY);
  } catch {
    // no-op
  }
}

// ---- internals ----

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return typeof btoa !== "undefined" ? btoa(s) : "";
}

function fromBase64(s: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(s, "base64"));
  }
  if (typeof atob === "undefined") return new Uint8Array(0);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
