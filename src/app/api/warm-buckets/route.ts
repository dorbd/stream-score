// GET /api/warm-buckets
//
// Pre-warms the Daily Bucket cache for the top combos so cold users always
// hit a cached pick. Triggered by Vercel Cron every 5 minutes (see
// vercel.json). Each combo internally calls /api/daily-pick which will
// populate the in-memory cache.
//
// Combos to warm: cross-product of TOP_COUNTRIES x TOP_SERVICE_SETS x
// HOUR_BUCKETS (we let weather/holiday default from edge — those buckets
// just get a fresh entry per region naturally over time).
//
// In production, set the env var `WARM_BUCKETS_SECRET` and pass it as
// `?secret=…` so this endpoint cannot be invoked by random callers.

import { NextRequest, NextResponse } from "next/server";
import { sweepBucketCache, bucketCacheSize } from "@/lib/bucket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOP_COUNTRIES = ["US", "GB", "CA", "AU", "DE", "FR"] as const;

const TOP_SERVICE_SETS: string[][] = [
  [],                                            // cold-start / "all"
  ["netflix"],
  ["netflix", "max"],
  ["netflix", "prime_video"],
  ["netflix", "hulu", "max"],
  ["disney_plus", "netflix"],
  ["prime_video"],
  ["max"],
  ["apple_tv_plus"],
];

const HOUR_BUCKETS: { hour: number }[] = [
  { hour: 8 },   // morning
  { hour: 14 },  // afternoon
  { hour: 20 },  // evening
  { hour: 1 },   // late-night
];

async function warmOne(origin: string, providers: string[], country: string, hour: number): Promise<{ key: string; ok: boolean; ms: number }> {
  const params = new URLSearchParams();
  if (providers.length) params.set("providers", providers.join(","));
  params.set("country", country);
  params.set("hour", String(hour));
  const url = `${origin}/api/daily-pick?${params.toString()}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { cache: "no-store" });
    const ms = Date.now() - t0;
    return { key: `${country}|${providers.join("+") || "any"}|${hour}`, ok: res.ok, ms };
  } catch {
    return { key: `${country}|${providers.join("+") || "any"}|${hour}`, ok: false, ms: Date.now() - t0 };
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.WARM_BUCKETS_SECRET;
  if (secret) {
    const provided = req.nextUrl.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const origin = req.nextUrl.origin;
  const swept = sweepBucketCache();

  const jobs: Promise<{ key: string; ok: boolean; ms: number }>[] = [];
  for (const country of TOP_COUNTRIES) {
    for (const services of TOP_SERVICE_SETS) {
      for (const { hour } of HOUR_BUCKETS) {
        jobs.push(warmOne(origin, services, country, hour));
      }
    }
  }

  // Modest concurrency so we don't hammer TMDb/OMDb.
  const CHUNK = 6;
  const results: { key: string; ok: boolean; ms: number }[] = [];
  for (let i = 0; i < jobs.length; i += CHUNK) {
    const chunk = jobs.slice(i, i + CHUNK);
    const settled = await Promise.all(chunk);
    results.push(...settled);
  }

  const ok = results.filter((r) => r.ok).length;
  return NextResponse.json({
    warmed: ok,
    total: results.length,
    swept,
    cacheSize: bucketCacheSize(),
    durationMs: results.reduce((s, r) => s + r.ms, 0),
    sample: results.slice(0, 8),
  });
}
