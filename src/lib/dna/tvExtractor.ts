// stream·score DNA — TV show → 7-vec loading extractor.
//
// Critic #9 wanted a "name a TV show" prompt to pull additional signal
// from anchor TV titles. The result is folded into `computeVector` at
// 0.5× weight (the weighting happens here so the caller doesn't need to
// remember the rule). The full pipeline:
//
//   1. (Optional) Groq Llama 3.3 70B Versatile parses free text →
//      { title, year_hint? }. If GROQ_API_KEY is unset, skip to (2)
//      with the raw text as the query.
//   2. TMDb `/search/tv?query=...` → pick the best vote-count match.
//   3. TMDb `/tv/{id}` → genres + first_air_date.
//   4. Compute a 7-dim loading via a hand-tuned genre/era table that
//      mirrors the movie fingerprint pipeline.
//   5. Scale by 0.5× (the TV-history weighting from the spec).
//   6. Cache by lowercased input text for 24h.
//
// Returns `null` when nothing resolvable matches.

import { AXES } from "./types";
import type { Vector7 } from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const TV_WEIGHT = 0.5;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;

interface CacheEntry {
  value: Vector7 | null;
  at: number;
}
const cache = new Map<string, CacheEntry>();

// ---- TMDb shapes -----------------------------------------------------------

interface TmdbTvSearchHit {
  id: number;
  name: string;
  original_name: string;
  first_air_date: string;
  popularity: number;
  vote_count: number;
  genre_ids: number[];
  original_language: string;
}

interface TmdbTvSearchResp {
  results: TmdbTvSearchHit[];
}

interface TmdbTvDetail {
  id: number;
  name: string;
  first_air_date: string;
  genres: { id: number; name: string }[];
  original_language: string;
  episode_run_time: number[];
  overview: string;
}

// ---- 7-vec genre loadings --------------------------------------------------
//
// Axis layout (canonical): see AXES in ./types.
//   0 prestigePopcorn  (+prestige, -popcorn)
//   1 modernClassic    (+modern,   -classic)
//   2 lightDark        (+light,    -dark)
//   3 realityFantasy   (+reality,  -fantasy)
//   4 slowKinetic      (+slow,     -kinetic)
//   5 soloCommunal     (+solo,     -communal)
//   6 familiarForeign  (+familiar, -foreign)
//
// Each row is a Vector7 in the same units as `data/dna/loadings.json`
// (signed, roughly bounded to [-1.5, +1.5]). We're being conservative —
// these aren't measured weights, they're craft intuition, and they only
// nudge the final vector at 0.5× before normalization.

const TV_GENRE_LOADINGS: Record<number, Vector7> = {
  // 10759 Action & Adventure → popcorn, modern, light, real, kinetic, communal
  10759: [-0.7, 0.4, 0.2, 0.3, -0.9, -0.6, 0.3],
  // 16    Animation → modern-ish, light, fantasy, kinetic, communal, sometimes foreign
  16: [-0.1, 0.3, 0.5, -0.9, -0.3, -0.4, -0.2],
  // 35    Comedy → light, communal
  35: [-0.3, 0.2, 0.8, 0.0, -0.2, -0.7, 0.2],
  // 80    Crime → prestige-leaning, modern, dark, real, kinetic
  80: [0.5, 0.4, -0.8, 0.6, -0.3, 0.2, 0.1],
  // 99    Documentary → prestige, real, slow, solo
  99: [0.8, 0.3, 0.0, 1.1, 0.5, 0.6, -0.2],
  // 18    Drama → prestige, dark, real, slow, solo
  18: [0.9, 0.1, -0.4, 0.5, 0.6, 0.4, 0.1],
  // 10751 Family → light, communal, familiar
  10751: [-0.4, 0.0, 0.9, 0.2, -0.2, -0.9, 0.4],
  // 10762 Kids → light, communal, kinetic, familiar
  10762: [-0.6, 0.1, 1.0, 0.0, -0.4, -0.9, 0.4],
  // 9648  Mystery → prestige, dark, slow, solo
  9648: [0.6, 0.0, -0.6, 0.3, 0.4, 0.5, 0.1],
  // 10763 News → real, familiar (excluded from taste contribution; small magnitude)
  10763: [0.0, 0.4, 0.0, 0.9, 0.0, 0.2, 0.5],
  // 10764 Reality → popcorn, modern, light, real, communal, familiar
  10764: [-0.8, 0.6, 0.4, 1.0, -0.3, -0.6, 0.5],
  // 10765 Sci-Fi & Fantasy → modern, dark-ish, fantasy, kinetic, foreign
  10765: [0.2, 0.5, -0.2, -1.0, -0.4, 0.0, -0.4],
  // 10766 Soap → popcorn, light, real, communal, familiar
  10766: [-0.7, 0.0, 0.5, 0.7, -0.1, -0.6, 0.5],
  // 10767 Talk → popcorn, modern, light, real, communal, familiar
  10767: [-0.5, 0.5, 0.6, 1.0, -0.1, -0.5, 0.5],
  // 10768 War & Politics → prestige, dark, real, slow
  10768: [0.7, 0.0, -0.7, 0.7, 0.4, 0.1, 0.0],
  // 37    Western → classic, dark, kinetic, solo, foreign-ish (in 2026)
  37: [0.3, -0.8, -0.4, 0.4, 0.0, 0.5, -0.2],
};

// ---- Aggregation helpers ---------------------------------------------------

function zero7(): Vector7 {
  return [0, 0, 0, 0, 0, 0, 0];
}

function clampAxis(x: number): number {
  if (x > 1.5) return 1.5;
  if (x < -1.5) return -1.5;
  return x;
}

function loadingFromDetail(d: TmdbTvDetail): Vector7 {
  const rows: Vector7[] = [];
  for (const g of d.genres) {
    const row = TV_GENRE_LOADINGS[g.id];
    if (row) rows.push(row);
  }

  const out = zero7();
  if (rows.length > 0) {
    for (const row of rows) {
      for (let i = 0; i < AXES.length; i++) out[i] += row[i];
    }
    for (let i = 0; i < AXES.length; i++) out[i] /= rows.length;
  }

  // Era nudge → modernClassic axis. Pre-2000 series read as "classic" in
  // 2026; 2020+ reads as "modern". Mid-range gets no bump.
  const year = d.first_air_date ? Number(d.first_air_date.slice(0, 4)) : NaN;
  if (Number.isFinite(year)) {
    if (year >= 2020) out[1] += 0.4;
    else if (year < 2000) out[1] -= 0.6;
  }

  // Non-English original language → foreign lean (axis 6 is +familiar / -foreign).
  if (d.original_language && d.original_language !== "en") {
    out[6] -= 0.6;
  }

  // Long episode runtime (>50 min) reads as more prestige / slower; short
  // (<25 min) reads as popcorn / kinetic.
  const runtime = Array.isArray(d.episode_run_time) && d.episode_run_time.length > 0
    ? d.episode_run_time[0]
    : 0;
  if (runtime >= 50) {
    out[0] += 0.2; // prestige
    out[4] += 0.2; // slow
  } else if (runtime > 0 && runtime <= 25) {
    out[0] -= 0.2; // popcorn
    out[4] -= 0.2; // kinetic
  }

  // Final clamp + 0.5× weight scale.
  for (let i = 0; i < AXES.length; i++) {
    out[i] = clampAxis(out[i]) * TV_WEIGHT;
  }
  return out;
}

// ---- TMDb plumbing ---------------------------------------------------------

function getTmdbKey(): string {
  const k = process.env.TMDB_API_KEY;
  if (!k) throw new Error("TMDB_API_KEY is not set.");
  return k;
}

async function tmdbTvSearch(
  query: string,
  yearHint?: number,
): Promise<TmdbTvSearchHit | null> {
  const url = new URL(`${TMDB_BASE}/search/tv`);
  url.searchParams.set("api_key", getTmdbKey());
  url.searchParams.set("language", "en-US");
  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");
  if (yearHint && Number.isFinite(yearHint)) {
    url.searchParams.set("first_air_date_year", String(yearHint));
  }
  const res = await fetch(url, { next: { revalidate: 60 * 60 } });
  if (!res.ok) return null;
  const body = (await res.json()) as TmdbTvSearchResp;
  const results = body.results ?? [];
  if (results.length === 0) return null;
  return [...results]
    .slice(0, 5)
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))[0];
}

async function tmdbTvDetail(id: number): Promise<TmdbTvDetail | null> {
  const url = new URL(`${TMDB_BASE}/tv/${id}`);
  url.searchParams.set("api_key", getTmdbKey());
  url.searchParams.set("language", "en-US");
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
  if (!res.ok) return null;
  return (await res.json()) as TmdbTvDetail;
}

// ---- Pass 1: Groq parse ----------------------------------------------------

interface ParsedTvGuess {
  title: string;
  year_hint?: number;
}

async function parseWithGroq(text: string): Promise<ParsedTvGuess | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 80,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Extract the single TV show title the user wants to anchor on from their free-text input. Respond ONLY with JSON of the shape {"title": string, "year_hint"?: number}. If the user names multiple shows, pick the one they emphasise most. Never invent fake titles.',
          },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const raw = body.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ParsedTvGuess>;
    if (typeof parsed.title !== "string" || parsed.title.trim().length === 0) {
      return null;
    }
    return {
      title: parsed.title.trim(),
      year_hint:
        typeof parsed.year_hint === "number" ? parsed.year_hint : undefined,
    };
  } catch {
    return null;
  }
}

// ---- Public API ------------------------------------------------------------

/**
 * Extract a 7-vec loading from a free-text TV-show mention, already scaled
 * by the 0.5× TV-history weight. Returns `null` when nothing resolves.
 *
 * The result is cached for 24h by lowercased input text.
 */
export async function extractTvLoading(text: string): Promise<Vector7 | null> {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  const cacheKey = trimmed.toLowerCase();

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value;
  }

  try {
    // Pass 1: optional Groq parse → { title, year_hint? }; otherwise use raw text.
    const guess = (await parseWithGroq(trimmed)) ?? { title: trimmed };
    // Pass 2: TMDb /search/tv.
    const found = await tmdbTvSearch(guess.title, guess.year_hint);
    if (!found) {
      cache.set(cacheKey, { value: null, at: Date.now() });
      return null;
    }
    // Pass 3: TMDb /tv/{id} → genres + first_air_date.
    const detail = await tmdbTvDetail(found.id);
    if (!detail) {
      cache.set(cacheKey, { value: null, at: Date.now() });
      return null;
    }
    const loading = loadingFromDetail(detail);
    cache.set(cacheKey, { value: loading, at: Date.now() });
    return loading;
  } catch {
    // Never let a TMDb hiccup blow up the quiz flow. Cache the miss for a
    // short window so we don't hammer the API on every keystroke retry.
    cache.set(cacheKey, { value: null, at: Date.now() });
    return null;
  }
}
