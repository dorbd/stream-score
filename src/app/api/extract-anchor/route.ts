// Two-pass anchor extractor.
//
// Pass 1 — *Parse:* a free-text user input ("something like Past Lives,
// quiet & wistful") is normalised into a TMDb title via either a Groq
// LLM call (when GROQ_API_KEY is set) or a direct TMDb /search/movie
// lookup (always). Pass 1 produces { title, year? } guesses.
//
// Pass 2 — *Resolve:* we resolve the guess against TMDb /search/movie,
// pull the top result, and synthesise a fingerprint from its genres,
// runtime, release year, and language. The Groq path can optionally
// improve the fingerprint with semantic dims (tone/weirdness).
//
// Result cache is keyed by tmdb_id (the same anchor is the same
// fingerprint for everyone) using an in-memory Map.

import { NextRequest, NextResponse } from "next/server";
import type { AnchorFingerprint } from "@/lib/anchor";

const TMDB_BASE = "https://api.themoviedb.org/3";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

interface ExtractedAnchor {
  tmdbId: number;
  title: string;
  year: number | null;
  fingerprint: AnchorFingerprint;
}

interface CachedRow {
  value: ExtractedAnchor;
  at: number;
}
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h is plenty — TMDb metadata barely moves.
const cache = new Map<number, CachedRow>();

interface TmdbSearchHit {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  overview: string;
  popularity: number;
  vote_count: number;
  genre_ids: number[];
  original_language: string;
}

interface TmdbSearchResp {
  results: TmdbSearchHit[];
}

interface TmdbMovieDetail {
  id: number;
  title: string;
  release_date: string;
  runtime: number | null;
  genres: { id: number; name: string }[];
  original_language: string;
  overview: string;
  tagline: string | null;
}

// ---- Fingerprint synthesis ----
//
// Map TMDb genre IDs to soft taste-dimension hints. These are intuitive
// gut numbers, not learned weights; the Kalman update in `taste.ts`
// will correct them over time per-user.

const GENRE_HINTS: Record<number, Partial<AnchorFingerprint>> = {
  28: { pace: 0.85, tone: 0.7, density: 0.5, weirdness: 0.4 }, // Action
  12: { pace: 0.75, tone: 0.6, density: 0.55, weirdness: 0.45 }, // Adventure
  16: { pace: 0.6, tone: 0.4, palette: 0.65, weirdness: 0.55 }, // Animation
  35: { pace: 0.65, tone: 0.25, density: 0.45, weirdness: 0.4 }, // Comedy
  80: { pace: 0.55, tone: 0.75, density: 0.65, weirdness: 0.45 }, // Crime
  99: { pace: 0.35, tone: 0.55, density: 0.7, weirdness: 0.4 }, // Documentary
  18: { pace: 0.35, tone: 0.65, density: 0.75, weirdness: 0.4 }, // Drama
  10751: { pace: 0.55, tone: 0.3, density: 0.4, weirdness: 0.3 }, // Family
  14: { pace: 0.6, tone: 0.5, palette: 0.7, weirdness: 0.65 }, // Fantasy
  36: { pace: 0.3, tone: 0.6, density: 0.75, weirdness: 0.4, era: 0.25 }, // History
  27: { pace: 0.55, tone: 0.85, density: 0.55, weirdness: 0.7 }, // Horror
  10402: { pace: 0.6, tone: 0.4, palette: 0.65, weirdness: 0.5 }, // Music
  9648: { pace: 0.45, tone: 0.7, density: 0.7, weirdness: 0.55 }, // Mystery
  10749: { pace: 0.35, tone: 0.35, density: 0.6, palette: 0.55 }, // Romance
  878: { pace: 0.6, tone: 0.6, density: 0.7, weirdness: 0.7 }, // Sci-Fi
  10770: { pace: 0.55, tone: 0.5, density: 0.5, weirdness: 0.4 }, // TV Movie
  53: { pace: 0.7, tone: 0.75, density: 0.65, weirdness: 0.45 }, // Thriller
  10752: { pace: 0.55, tone: 0.8, density: 0.7, weirdness: 0.4 }, // War
  37: { pace: 0.4, tone: 0.65, density: 0.55, palette: 0.6, era: 0.25 }, // Western
};

function avg(values: number[]): number {
  if (values.length === 0) return 0.5;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function fingerprintFromDetail(d: TmdbMovieDetail): AnchorFingerprint {
  const hints = d.genres
    .map((g) => GENRE_HINTS[g.id])
    .filter((h): h is Partial<AnchorFingerprint> => Boolean(h));

  // Aggregate each dim independently.
  const pick = (k: keyof AnchorFingerprint): number[] =>
    hints.map((h) => h[k]).filter((v): v is number => typeof v === "number");

  const year = d.release_date ? Number(d.release_date.slice(0, 4)) : NaN;
  // Era: 0 = old, 1 = brand-new. 1920 → 0, 2030 → 1, clamp.
  const era = Number.isFinite(year)
    ? clamp01((year - 1920) / 110)
    : 0.6;

  // Runtime: 0 = very short, 1 = very long. 60 min → 0, 200 min → 1.
  const runtime = typeof d.runtime === "number" && d.runtime > 0
    ? clamp01((d.runtime - 60) / 140)
    : 0.5;

  // Auteur: a soft proxy that goes up for non-English originals and
  // older works, both of which lean "auteur-ish". This is intentionally
  // crude — the real signal would need credits-level data.
  const nonEnglishBoost = d.original_language && d.original_language !== "en" ? 0.25 : 0;
  const auteurBase = 0.45 + nonEnglishBoost + (era < 0.5 ? 0.1 : 0);

  return {
    pace: clamp01(avg(pick("pace"))),
    tone: clamp01(avg(pick("tone"))),
    density: clamp01(avg(pick("density"))),
    palette: clamp01(avg(pick("palette"))),
    era,
    auteur: clamp01(auteurBase),
    runtime,
    weirdness: clamp01(avg(pick("weirdness"))),
    confidence: hints.length === 0 ? 0.35 : Math.min(0.9, 0.5 + 0.1 * hints.length),
  };
}

// ---- TMDb helpers ----

function getTmdbKey(): string {
  const k = process.env.TMDB_API_KEY;
  if (!k) throw new Error("TMDB_API_KEY is not set.");
  return k;
}

async function tmdbSearch(query: string, year?: number): Promise<TmdbSearchHit | null> {
  const url = new URL(`${TMDB_BASE}/search/movie`);
  url.searchParams.set("api_key", getTmdbKey());
  url.searchParams.set("language", "en-US");
  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");
  if (year && Number.isFinite(year)) {
    url.searchParams.set("primary_release_year", String(year));
  }
  const res = await fetch(url, { next: { revalidate: 60 * 60 } });
  if (!res.ok) return null;
  const body = (await res.json()) as TmdbSearchResp;
  const results = body.results ?? [];
  if (results.length === 0) return null;
  // Prefer most-voted result among the top few — guards against
  // obscure same-name results out-ranking the canonical one.
  return [...results]
    .slice(0, 5)
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))[0];
}

async function tmdbDetail(id: number): Promise<TmdbMovieDetail | null> {
  const url = new URL(`${TMDB_BASE}/movie/${id}`);
  url.searchParams.set("api_key", getTmdbKey());
  url.searchParams.set("language", "en-US");
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
  if (!res.ok) return null;
  return (await res.json()) as TmdbMovieDetail;
}

// ---- Pass 1: parse free-text → { title, year? } ----

interface ParsedGuess {
  title: string;
  year?: number;
}

async function parseWithGroq(text: string): Promise<ParsedGuess | null> {
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
              'Extract the single movie title the user wants to anchor on, from their free-text input. Respond ONLY with JSON of the shape {"title": string, "year"?: number}. If no specific film is named, infer the most likely film from the description. Never invent fake titles.',
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
    const parsed = JSON.parse(raw) as Partial<ParsedGuess>;
    if (typeof parsed.title !== "string" || parsed.title.trim().length === 0) {
      return null;
    }
    return {
      title: parsed.title.trim(),
      year: typeof parsed.year === "number" ? parsed.year : undefined,
    };
  } catch {
    return null;
  }
}

function parseHeuristic(text: string): ParsedGuess {
  // Strip leading framing words; pull out a (YYYY) hint if present.
  let t = text.trim();
  const yearMatch = t.match(/\((\d{4})\)/);
  const year = yearMatch ? Number(yearMatch[1]) : undefined;
  if (yearMatch) t = t.replace(yearMatch[0], "").trim();
  t = t.replace(
    /^(something|movies?|films?|stuff)\s+(like|similar to|in the style of|kinda like)\s+/i,
    "",
  );
  t = t.replace(/^(like|similar to|in the style of|kinda like)\s+/i, "");
  // Drop trailing mood riders ("..., quiet and wistful").
  const commaIdx = t.indexOf(",");
  if (commaIdx > 4) t = t.slice(0, commaIdx).trim();
  return { title: t, year };
}

// ---- Handler ----

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { text?: string; tmdbId?: number };
  try {
    body = (await req.json()) as { text?: string; tmdbId?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Direct path: caller already knows the tmdbId (autocomplete pick).
  if (typeof body.tmdbId === "number" && Number.isFinite(body.tmdbId)) {
    const cached = cache.get(body.tmdbId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return NextResponse.json(cached.value);
    }
    try {
      const detail = await tmdbDetail(body.tmdbId);
      if (!detail) {
        return NextResponse.json({ error: "Movie not found." }, { status: 404 });
      }
      const out: ExtractedAnchor = {
        tmdbId: detail.id,
        title: detail.title,
        year: detail.release_date ? Number(detail.release_date.slice(0, 4)) || null : null,
        fingerprint: fingerprintFromDetail(detail),
      };
      cache.set(out.tmdbId, { value: out, at: Date.now() });
      return NextResponse.json(out);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json(
      { error: 'Body must include either {"text": string} or {"tmdbId": number}.' },
      { status: 400 },
    );
  }

  try {
    // Pass 1: try Groq, fall back to heuristic.
    const guess = (await parseWithGroq(text)) ?? parseHeuristic(text);
    // Pass 2: resolve via TMDb.
    const hit = await tmdbSearch(guess.title, guess.year);
    if (!hit) {
      return NextResponse.json(
        { error: `No TMDb match for "${guess.title}".` },
        { status: 404 },
      );
    }
    const cached = cache.get(hit.id);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return NextResponse.json(cached.value);
    }
    const detail = await tmdbDetail(hit.id);
    if (!detail) {
      return NextResponse.json({ error: "Movie detail unavailable." }, { status: 502 });
    }
    const out: ExtractedAnchor = {
      tmdbId: detail.id,
      title: detail.title,
      year: detail.release_date ? Number(detail.release_date.slice(0, 4)) || null : null,
      fingerprint: fingerprintFromDetail(detail),
    };
    cache.set(out.tmdbId, { value: out, at: Date.now() });
    return NextResponse.json(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
