"use client";

// stream·score DNA — localStorage persistence.
//
// Mirrors the `useSyncExternalStore` pattern from
// `src/hooks/useSelectedProviders.ts` so the result feels native to the
// rest of the codebase: module-level cache, custom-event subscription,
// deterministic getSnapshot, server snapshot returns `null`.
//
// The `v: 1` field on every stored record is **mandatory** and gates a
// future versioned migration. Anything written without `v` is treated
// as garbage and discarded on read.
//
// Storage cap is ~2KB — we never persist anything beyond the schema in
// `StoredDna`. In particular: NO raw question loadings, NO question
// prompts, NO server-side identifiers.

import { useEffect, useState, useSyncExternalStore } from "react";

export const DNA_STORAGE_KEY = "stream-score:dna:v1";
const EVENT = "stream-score:dna-changed";

/**
 * Voice variants the reveal endpoint understands. The mapping from a
 * user's 7-vec to a voice is deterministic — see `pickVoice` below.
 */
export type VoiceVariant =
  | "playful"
  | "intellectual"
  | "dry"
  | "warm"
  | "blunt"
  | "poetic"
  | "skeptical"
  | "bright";

export const VOICE_VARIANTS: readonly VoiceVariant[] = [
  "playful",
  "intellectual",
  "dry",
  "warm",
  "blunt",
  "poetic",
  "skeptical",
  "bright",
] as const;

export interface StoredDna {
  /** Schema version — bump and add a migration when the shape changes. */
  v: 1;
  /** The user's normalized 7-vec, axes in canonical order. */
  vector: number[];
  /** Archetype key, e.g. `"slow_burn_romantic"`. */
  archetype: string;
  /** Second-best archetype, or `null` if there is no meaningful runner-up. */
  secondaryArchetype: string | null;
  /** Softmax-gap confidence in `[0, 1]`. */
  confidence: number;
  /** Voice variant chosen client-side from secondary axis loadings. */
  voiceVariant: VoiceVariant;
  /** Raw answers; `"skip"` is preserved so we can re-run computeVector. */
  answers: Record<string, "a" | "b" | "skip">;
  /** Epoch ms when the assignment was finalised. */
  createdAt: number;
  /** Per-question response times for local analytics only (never sent). */
  responseTimesMs?: number[];
}

// ---- Module-level cache ----------------------------------------------------
//
// `cached` holds the most recently observed value; we swap the *reference*
// (never mutate) so `useSyncExternalStore` can rely on `===` identity to
// decide whether to re-render. `hydrated` flips to `true` after the first
// successful read from `localStorage` in the browser.

let cached: StoredDna | null = null;
let hydrated = false;

function isAnswerValue(x: unknown): x is "a" | "b" | "skip" {
  return x === "a" || x === "b" || x === "skip";
}

function isVoiceVariant(x: unknown): x is VoiceVariant {
  return typeof x === "string" && (VOICE_VARIANTS as readonly string[]).includes(x);
}

/** Defensive parser: validates shape, returns `null` on any mismatch. */
function parse(raw: string | null): StoredDna | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;
  if (r.v !== 1) return null;
  if (!Array.isArray(r.vector) || r.vector.length !== 7) return null;
  if (!r.vector.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return null;
  }
  if (typeof r.archetype !== "string" || r.archetype.length === 0) return null;
  if (r.secondaryArchetype !== null && typeof r.secondaryArchetype !== "string") {
    return null;
  }
  if (typeof r.confidence !== "number" || !Number.isFinite(r.confidence)) return null;
  if (!isVoiceVariant(r.voiceVariant)) return null;
  if (!r.answers || typeof r.answers !== "object") return null;
  const answers: Record<string, "a" | "b" | "skip"> = {};
  for (const [k, v] of Object.entries(r.answers as Record<string, unknown>)) {
    if (!isAnswerValue(v)) return null;
    answers[k] = v;
  }
  if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) return null;
  let responseTimesMs: number[] | undefined;
  if (Array.isArray(r.responseTimesMs)) {
    if (!r.responseTimesMs.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return null;
    }
    responseTimesMs = r.responseTimesMs as number[];
  }
  return {
    v: 1,
    vector: r.vector as number[],
    archetype: r.archetype,
    secondaryArchetype: (r.secondaryArchetype as string | null) ?? null,
    confidence: r.confidence,
    voiceVariant: r.voiceVariant,
    answers,
    createdAt: r.createdAt,
    ...(responseTimesMs ? { responseTimesMs } : {}),
  };
}

function readFromStorage(): StoredDna | null {
  if (typeof window === "undefined") return null;
  try {
    return parse(window.localStorage.getItem(DNA_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Deep-equality check — narrow enough for our small payload. */
function equal(a: StoredDna | null, b: StoredDna | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.archetype !== b.archetype) return false;
  if (a.secondaryArchetype !== b.secondaryArchetype) return false;
  if (a.confidence !== b.confidence) return false;
  if (a.voiceVariant !== b.voiceVariant) return false;
  if (a.createdAt !== b.createdAt) return false;
  if (a.vector.length !== b.vector.length) return false;
  for (let i = 0; i < a.vector.length; i++) {
    if (a.vector[i] !== b.vector[i]) return false;
  }
  const ak = Object.keys(a.answers);
  const bk = Object.keys(b.answers);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a.answers[k] !== b.answers[k]) return false;
  return true;
}

function refreshCache(): void {
  const next = readFromStorage();
  if (!equal(next, cached)) {
    cached = next;
  }
  hydrated = true;
}

// ---- Public API ------------------------------------------------------------

/** Synchronously read the stored DNA, or `null` if none / invalid. */
export function readStoredDna(): StoredDna | null {
  if (typeof window === "undefined") return null;
  return parse(window.localStorage.getItem(DNA_STORAGE_KEY));
}

/** Persist a fresh DNA result. Idempotent — repeated identical writes are safe. */
export function writeStoredDna(d: StoredDna): void {
  if (typeof window === "undefined") return;
  // Enforce version + sanity. The TS types make most of this redundant, but
  // we are crossing a JSON boundary so cheap runtime checks pay for themselves.
  if (d.v !== 1) throw new Error("writeStoredDna: only v=1 is supported.");
  if (!Array.isArray(d.vector) || d.vector.length !== 7) {
    throw new Error("writeStoredDna: vector must be length 7.");
  }
  const serialised = JSON.stringify(d);
  window.localStorage.setItem(DNA_STORAGE_KEY, serialised);
  cached = d;
  hydrated = true;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: d }));
}

/** Wipe stored DNA. Useful for "Retake the quiz" affordances. */
export function clearStoredDna(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DNA_STORAGE_KEY);
  cached = null;
  hydrated = true;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: null }));
}

// ---- React hook ------------------------------------------------------------

function subscribe(callback: () => void): () => void {
  const onChange = () => {
    refreshCache();
    callback();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): StoredDna | null {
  if (!hydrated) refreshCache();
  return cached;
}

function getServerSnapshot(): StoredDna | null {
  return null;
}

/** React hook — subscribes to localStorage updates and cross-tab `storage` events. */
export function useStoredDna(): { dna: StoredDna | null; hydrated: boolean } {
  const dna = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Defer hydrated to post-mount to avoid SSR/CSR markup mismatch.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    let canceled = false;
    Promise.resolve().then(() => {
      if (!canceled) setIsHydrated(hydrated);
    });
    return () => {
      canceled = true;
    };
  }, []);
  return { dna, hydrated: isHydrated };
}

// ---- Voice variant picker --------------------------------------------------
//
// Deterministic mapping from (vector, archetype) → voice. The dominant axis
// for each archetype is the one its centroid is heaviest in; the *secondary*
// axes are everything else. We look at the user's lean on the lightDark axis
// first (it's the single most expressive tonal dimension) and reach for
// modernClassic + soloCommunal as tie-breakers.
//
// Axes in canonical order:
//   0 prestigePopcorn  (+prestige, -popcorn)
//   1 modernClassic    (+modern,   -classic)
//   2 lightDark        (+light,    -dark)
//   3 realityFantasy   (+reality,  -fantasy)
//   4 slowKinetic      (+slow,     -kinetic)
//   5 soloCommunal     (+solo,     -communal)
//   6 familiarForeign  (+familiar, -foreign)

/**
 * Map an archetype + 7-vec to a voice. Pure function, no IO.
 *
 * The selection rule is:
 *   1. Each archetype has a default voice that fits its centroid.
 *   2. Two override axes can re-skin the voice when the user is far
 *      off-centroid on lightDark / modernClassic / soloCommunal.
 */
export function pickVoice(vector: number[], archetypeKey: string): VoiceVariant {
  const v = vector.length === 7 ? vector : [0, 0, 0, 0, 0, 0, 0];
  const lightDark = v[2];
  const modernClassic = v[1];
  const soloCommunal = v[5];

  // Archetype defaults — hand-tuned to fit each centroid's mood.
  const defaults: Record<string, VoiceVariant> = {
    slow_burn_romantic: "poetic",
    late_night_stylist: "dry",
    cerebral_adventurer: "intellectual",
    domestic_excavator: "warm",
    gleeful_maximalist: "playful",
    dread_cartographer: "blunt",
    genre_mechanic: "skeptical",
    tender_absurdist: "playful",
    street_realist: "blunt",
    mythic_wanderer: "bright",
  };

  const base = defaults[archetypeKey] ?? "warm";

  // Overrides — only fire when the lean is unambiguous (>0.4 on the unit vec).
  // Strong "light" lean nudges toward a warmer / brighter voice; strong "dark"
  // lean nudges toward dry / blunt / skeptical depending on the base.
  if (lightDark > 0.4) {
    if (base === "blunt" || base === "skeptical") return "dry";
    if (base === "intellectual") return "bright";
    if (base === "poetic") return "warm";
  } else if (lightDark < -0.4) {
    if (base === "warm") return "dry";
    if (base === "bright") return "intellectual";
    if (base === "playful") return "skeptical";
  }

  // Classic lean + an intellectual or skeptical base → poetic (older taste
  // tends toward a more elegiac register).
  if (modernClassic < -0.4 && (base === "intellectual" || base === "skeptical")) {
    return "poetic";
  }

  // Heavy communal lean re-skins a solitary voice into something warmer.
  if (soloCommunal < -0.5 && base === "dry") {
    return "warm";
  }

  return base;
}
