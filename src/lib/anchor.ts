"use client";
// Per-user "anchor film" state. The anchor is the seed example a user
// volunteers ("Tune like Past Lives"); we keep a thin, schema-versioned
// fingerprint in localStorage and notify subscribers via the same
// `useSyncExternalStore` pattern as the other hooks in this app.
//
// Total footprint: ~250 bytes JSON. Schema is versioned so future
// migrations can wipe-and-rebuild instead of inflating storage.

import { useCallback, useSyncExternalStore } from "react";

export const ANCHOR_STORAGE_KEY = "stream-score:anchor";
const EVENT = "stream-score:anchor-changed";

export const ANCHOR_SCHEMA_VERSION = 1;

export interface AnchorFingerprint {
  // 8 normalized dims in [0..1]. Matches `taste.ts` ordering.
  pace: number;
  tone: number;
  density: number;
  palette: number;
  era: number;
  auteur: number;
  runtime: number;
  weirdness: number;
  // 0..1, how confident the extractor was in the fingerprint.
  confidence: number;
}

export interface AnchorState {
  v: number; // schema version
  tmdbId: number;
  title: string;
  year: number | null;
  fingerprint: AnchorFingerprint;
  setAt: number; // epoch ms
}

let cached: AnchorState | null = null;
let cacheReady = false;
let cacheVersion = 0;

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validate(raw: unknown): AnchorState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== ANCHOR_SCHEMA_VERSION) return null;
  if (!isFiniteNum(r.tmdbId)) return null;
  if (typeof r.title !== "string" || r.title.length === 0) return null;
  const fp = r.fingerprint as Record<string, unknown> | undefined;
  if (!fp) return null;
  const dims: (keyof AnchorFingerprint)[] = [
    "pace",
    "tone",
    "density",
    "palette",
    "era",
    "auteur",
    "runtime",
    "weirdness",
    "confidence",
  ];
  const out: Partial<AnchorFingerprint> = {};
  for (const k of dims) {
    if (!isFiniteNum(fp[k])) return null;
    out[k] = fp[k] as number;
  }
  return {
    v: ANCHOR_SCHEMA_VERSION,
    tmdbId: r.tmdbId,
    title: r.title,
    year: isFiniteNum(r.year) ? r.year : null,
    fingerprint: out as AnchorFingerprint,
    setAt: isFiniteNum(r.setAt) ? r.setAt : Date.now(),
  };
}

function readFromStorage(): AnchorState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ANCHOR_STORAGE_KEY);
    if (!raw) return null;
    return validate(JSON.parse(raw));
  } catch {
    return null;
  }
}

function refreshCache(): void {
  const next = readFromStorage();
  const changed =
    (next == null) !== (cached == null) ||
    (next != null &&
      cached != null &&
      (next.tmdbId !== cached.tmdbId || next.setAt !== cached.setAt));
  if (changed || !cacheReady) {
    cached = next;
    cacheReady = true;
    cacheVersion++;
  }
}

function broadcast(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: cached }));
}

export function readAnchor(): AnchorState | null {
  if (!cacheReady) refreshCache();
  return cached;
}

export function writeAnchor(input: {
  tmdbId: number;
  title: string;
  year?: number | null;
  fingerprint: AnchorFingerprint;
}): AnchorState {
  const next: AnchorState = {
    v: ANCHOR_SCHEMA_VERSION,
    tmdbId: input.tmdbId,
    title: input.title,
    year: input.year ?? null,
    fingerprint: input.fingerprint,
    setAt: Date.now(),
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ANCHOR_STORAGE_KEY, JSON.stringify(next));
  }
  cached = next;
  cacheReady = true;
  cacheVersion++;
  broadcast();
  return next;
}

export function clearAnchor(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ANCHOR_STORAGE_KEY);
  }
  cached = null;
  cacheReady = true;
  cacheVersion++;
  broadcast();
}

function subscribe(cb: () => void): () => void {
  const onChange = () => {
    refreshCache();
    cb();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): AnchorState | null {
  if (!cacheReady) refreshCache();
  return cached;
}

function getServerSnapshot(): AnchorState | null {
  return null;
}

export function useAnchor(): {
  anchor: AnchorState | null;
  setAnchor: (input: {
    tmdbId: number;
    title: string;
    year?: number | null;
    fingerprint: AnchorFingerprint;
  }) => void;
  clear: () => void;
  hydrated: boolean;
} {
  const anchor = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = typeof window !== "undefined";
  const setAnchor = useCallback(
    (input: {
      tmdbId: number;
      title: string;
      year?: number | null;
      fingerprint: AnchorFingerprint;
    }) => {
      writeAnchor(input);
    },
    [],
  );
  const clear = useCallback(() => clearAnchor(), []);
  return { anchor, setAnchor, clear, hydrated };
}

// Internal — exposed for devtools/tests only.
export function __anchorCacheVersion(): number {
  return cacheVersion;
}
