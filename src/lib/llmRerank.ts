// LLM-curated hero pick. Uses Groq's Llama 3.3 70B Versatile model.
// - Privacy: NO user data in the prompt. Only bucket context + candidate movies.
// - Latency budget: 1.5s. We race against a 1.2s timeout and fall back to a
//   rule-based top-1 (with a generic caption) on timeout or any error.
// - Output: strict JSON `{heroId: number, caption: string, altIds: number[]}`.

import type { RankedMovie } from "./rerank";
import type { HourBucket } from "./daypart";
import type { WeatherBucket } from "./ambientContext";

export interface LlmBucketContext {
  country: string;
  hourBucket: HourBucket;
  weatherBucket: WeatherBucket;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  holiday: string | null;
  daypartLabel: string;
}

export interface LlmPick {
  heroId: number;
  caption: string;
  altIds: number[];
  source: "llm" | "fallback";
  reason?: string;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const RACE_TIMEOUT_MS = 1200;
const FETCH_TIMEOUT_MS = 1500;

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function describeBucket(ctx: LlmBucketContext): string {
  const day = WEEKDAY_NAMES[ctx.weekday];
  const holiday = ctx.holiday && ctx.holiday !== "none" ? ` (${ctx.holiday})` : "";
  return `${day} ${ctx.hourBucket}${holiday}, weather: ${ctx.weatherBucket}, country: ${ctx.country}, time-of-day fit: ${ctx.daypartLabel}`;
}

function describeCandidates(top: RankedMovie[]): string {
  return top
    .map((r) => {
      const reasons = r.reasons.map((x) => x.phrase).slice(0, 2).join("; ");
      const score = Math.round(r.finalScore);
      const genres = r.movie.genres.slice(0, 3).join("/") || "—";
      const flat = r.movie.availability.flatrate.map((p) => p.name).slice(0, 3).join("/") || "—";
      return `- id=${r.movie.tmdbId} | "${r.movie.title}" (${r.movie.year ?? "?"}) | ${genres} | score=${score} | on=${flat} | why: ${reasons || "—"}`;
    })
    .join("\n");
}

function buildPrompt(ctx: LlmBucketContext, top: RankedMovie[]): { system: string; user: string } {
  const system =
    "You are stream-score's editorial curator. Pick the single best movie from the candidate list for the given moment, and write a one-sentence caption (max 18 words) explaining why. Then list 5 alternative ids in descending order of fit, drawn from the same list. NEVER invent ids. Output strict JSON: {\"heroId\": <number>, \"caption\": <string>, \"altIds\": [<number>, <number>, <number>, <number>, <number>]}.";

  const user = [
    `MOMENT: ${describeBucket(ctx)}`,
    "",
    "CANDIDATES (top 60 by rule-based score, with reasons):",
    describeCandidates(top),
    "",
    "Pick a hero that genuinely fits the moment, not just the highest-scored entry. Favor variety in genre vs. obvious blockbuster bait. Caption must be punchy, evocative, and reference the moment (weather, day, time) when it adds value. No spoilers, no superlatives like \"the greatest of all time\". Return ONLY the JSON object.",
  ].join("\n");

  return { system, user };
}

interface GroqResponse {
  choices?: { message?: { content?: string | null } | null }[];
}

interface ParsedLlm {
  heroId: number;
  caption: string;
  altIds: number[];
}

function safeParse(raw: string): ParsedLlm | null {
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    const heroId = Number(o.heroId);
    const caption = String(o.caption ?? "").trim();
    const altIdsRaw = Array.isArray(o.altIds) ? o.altIds : [];
    const altIds = altIdsRaw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
    if (!Number.isFinite(heroId) || !caption) return null;
    return { heroId, caption, altIds };
  } catch {
    return null;
  }
}

function fallback(top: RankedMovie[], reason: string): LlmPick {
  const hero = top[0];
  if (!hero) {
    return { heroId: 0, caption: "Nothing to pick from tonight.", altIds: [], source: "fallback", reason };
  }
  const caption = hero.reasons[0]?.phrase
    ? `Tonight: ${hero.reasons[0].phrase}.`
    : "Tonight's pick from your services.";
  return {
    heroId: hero.movie.tmdbId,
    caption,
    altIds: top.slice(1, 6).map((r) => r.movie.tmdbId),
    source: "fallback",
    reason,
  };
}

async function callGroq(
  apiKey: string,
  system: string,
  user: string,
  signal: AbortSignal,
): Promise<ParsedLlm | null> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.4,
      max_tokens: 320,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal,
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as GroqResponse;
  const content = json.choices?.[0]?.message?.content;
  if (!content) return null;
  return safeParse(content);
}

/**
 * Pick a hero + 5 alts + caption from a 60-candidate set using Groq.
 * Returns a rule-based fallback if the API key is missing or the call
 * times out / errors out / returns an invalid id.
 */
export async function pickHeroWithLlm(
  ctx: LlmBucketContext,
  top: RankedMovie[],
): Promise<LlmPick> {
  if (!top.length) return fallback(top, "no candidates");

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return fallback(top, "no GROQ_API_KEY");

  const { system, user } = buildPrompt(ctx, top);
  const validIds = new Set(top.map((r) => r.movie.tmdbId));

  const ac = new AbortController();
  const fetchTimer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  const racePromise = callGroq(apiKey, system, user, ac.signal).catch(() => null);
  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), RACE_TIMEOUT_MS));

  let parsed: ParsedLlm | null = null;
  try {
    parsed = await Promise.race([racePromise, timeoutPromise]);
  } finally {
    clearTimeout(fetchTimer);
  }
  if (!parsed) {
    ac.abort();
    return fallback(top, "llm timeout or empty");
  }

  if (!validIds.has(parsed.heroId)) {
    return fallback(top, "llm picked an invalid id");
  }

  const seen = new Set<number>([parsed.heroId]);
  const cleanAlts: number[] = [];
  for (const id of parsed.altIds) {
    if (!validIds.has(id) || seen.has(id)) continue;
    cleanAlts.push(id);
    seen.add(id);
    if (cleanAlts.length >= 5) break;
  }
  if (cleanAlts.length < 5) {
    for (const r of top) {
      const id = r.movie.tmdbId;
      if (seen.has(id)) continue;
      cleanAlts.push(id);
      seen.add(id);
      if (cleanAlts.length >= 5) break;
    }
  }

  return {
    heroId: parsed.heroId,
    caption: parsed.caption,
    altIds: cleanAlts,
    source: "llm",
  };
}
