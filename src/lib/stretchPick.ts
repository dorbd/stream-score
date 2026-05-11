// Weekly hand-curated rotation. Pure function — no side effects, no IO
// at call time (JSON is statically imported at build).

import stretchData from "../../data/stretch.json";

export interface StretchPick {
  tmdbId: number;
  title: string;
  year: number;
  caption: string;
  week: number;
}

// Anchored at Monday 2024-01-01 00:00:00 UTC. The 15-week cycle then
// drifts deterministically — any deploy in any region resolves to the
// same week number for the same wall clock.
const START_EPOCH = Date.UTC(2024, 0, 1, 0, 0, 0);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const pool: readonly StretchPick[] = Object.freeze(
  (stretchData as StretchPick[]).map((p) => Object.freeze({ ...p })),
);

export function getStretchPool(): readonly StretchPick[] {
  return pool;
}

export function currentWeekIndex(now: number = Date.now()): number {
  const len = pool.length;
  if (len <= 0) return 0;
  return Math.floor((now - START_EPOCH) / WEEK_MS) % len;
}

export function getCurrentStretchPick(now: number = Date.now()): StretchPick | null {
  if (pool.length === 0) return null;
  return pool[currentWeekIndex(now)];
}

export function getStretchPickForWeek(week: number): StretchPick | null {
  if (pool.length === 0) return null;
  const idx = ((week % pool.length) + pool.length) % pool.length;
  return pool[idx];
}
