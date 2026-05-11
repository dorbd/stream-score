// Daily Bucket: the global cache key for the LLM-curated hero pick.
// Bucket = (country, services_hash, hour_bucket, weather_bucket, weekday, holiday_flag).
// NO per-user data lives in the bucket key — that's the F8-approved invariant.

import { createHash } from "node:crypto";
import type { HourBucket } from "./daypart";
import type { WeatherBucket } from "./ambientContext";

export interface BucketKeyParts {
  country: string;
  servicesHash: string;
  hourBucket: HourBucket;
  weatherBucket: WeatherBucket;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  holidayFlag: string;
}

/**
 * Hash a sorted list of provider keys into a short, stable token.
 * `[]` -> `"any"`. Order-insensitive: `["max","netflix"]` and
 * `["netflix","max"]` produce the same hash.
 */
export function hashServices(keys: string[]): string {
  if (!keys.length) return "any";
  const sorted = [...new Set(keys.map((k) => k.toLowerCase().trim()).filter(Boolean))].sort();
  if (!sorted.length) return "any";
  return createHash("sha1").update(sorted.join(",")).digest("hex").slice(0, 10);
}

/** Compose the canonical bucket key string. */
export function bucketKey(parts: BucketKeyParts): string {
  return [
    parts.country.toUpperCase() || "??",
    parts.servicesHash,
    parts.hourBucket,
    parts.weatherBucket,
    String(parts.weekday),
    parts.holidayFlag,
  ].join(":");
}

// ---------- In-memory bucket cache ----------

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number = TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearBucketCache(): void {
  store.clear();
}

export function bucketCacheSize(): number {
  return store.size;
}

/** Sweep expired entries. Returns the number of entries removed. */
export function sweepBucketCache(): number {
  const now = Date.now();
  let removed = 0;
  for (const [k, v] of store) {
    if (v.expiresAt < now) {
      store.delete(k);
      removed++;
    }
  }
  return removed;
}
