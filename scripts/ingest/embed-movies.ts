// Offline ingest: build a richer per-movie DNA profile cache using Groq Llama.
//
// Run:
//   npx tsx scripts/ingest/embed-movies.ts
//   npx tsx scripts/ingest/embed-movies.ts --dry-run
//   npx tsx scripts/ingest/embed-movies.ts --limit=1000 --pages=50
//
// Output: data/dna/movie-profiles.json keyed by tmdbId. Each value is a 7-float
// vector in canonical AXES order (see src/lib/dna/types.ts), clipped to [-1, +1].
//
// Required env:
//   GROQ_API_KEY   — required unless --dry-run
//   TMDB_API_KEY   — required (used to discover candidates)
//
// The script checkpoints every CHECKPOINT_INTERVAL rows so an interrupted run
// resumes cheaply on the next invocation.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

interface CliArgs {
  dryRun: boolean;
  limit: number;
  pages: number;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { dryRun: false, limit: 10_000, pages: 500 };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--limit=")) out.limit = Math.max(1, Number(a.split("=")[1]) || out.limit);
    else if (a.startsWith("--pages=")) out.pages = Math.max(1, Number(a.split("=")[1]) || out.pages);
  }
  return out;
}

// Resolve repo root relative to the script's URL so the script works whether
// invoked from the repo root or elsewhere. Falls back to CWD if URL parsing
// fails (e.g. if someone copies the file out of tree).
function resolveRoot(): string {
  try {
    const here = new URL(import.meta.url).pathname; // scripts/ingest/embed-movies.ts
    return path.resolve(path.dirname(here), "..", "..");
  } catch {
    return process.cwd();
  }
}
const ROOT = resolveRoot();
const OUT_PATH = path.join(ROOT, "data", "dna", "movie-profiles.json");
const CHECKPOINT_INTERVAL = 200;
const TMDB_BASE = "https://api.themoviedb.org/3";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_CONCURRENCY = 6;

const AXES = [
  "prestigePopcorn",
  "modernClassic",
  "lightDark",
  "realityFantasy",
  "slowKinetic",
  "soloCommunal",
  "familiarForeign",
] as const;

const SYSTEM_PROMPT = `You assign a 7-dim taste-space profile to a movie.

Axes (in order). Sign convention: +1 = first label, -1 = second label.
  0. prestige (+) vs popcorn (-)         — auteur / awards vs blockbuster / fun
  1. modern (+) vs classic (-)           — recent feel vs old-school feel
  2. light (+) vs dark (-)               — warmth, humor vs grim, bleak
  3. reality (+) vs fantasy (-)          — grounded vs speculative / fantastical
  4. slow (+) vs kinetic (-)             — meditative vs high-energy
  5. solo (+) vs communal (-)            — best watched alone vs in a group
  6. familiar (+) vs foreign (-)         — cultural familiarity to a global English-speaking audience

For each axis, output a float in [-1.0, 1.0]. Output ONLY the JSON object:
{ "profile": [f0, f1, f2, f3, f4, f5, f6] }
No prose, no markdown fences, no explanation.`;

interface DiscoverMovie {
  id: number;
  title: string;
  overview: string;
  release_date: string | null;
  vote_count: number;
  original_language: string;
  genre_ids: number[];
}

interface DiscoverPage {
  page: number;
  total_pages: number;
  results: DiscoverMovie[];
}

interface MovieDetail {
  id: number;
  runtime: number | null;
  genres: { id: number; name: string }[];
  overview: string;
  release_date: string | null;
  original_language: string;
}

interface ProfileCache {
  [tmdbId: string]: number[];
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${url} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function discoverPage(tmdbKey: string, page: number): Promise<DiscoverPage> {
  const u = new URL(`${TMDB_BASE}/discover/movie`);
  u.searchParams.set("api_key", tmdbKey);
  u.searchParams.set("language", "en-US");
  u.searchParams.set("sort_by", "popularity.desc");
  u.searchParams.set("include_adult", "false");
  u.searchParams.set("include_video", "false");
  u.searchParams.set("vote_count.gte", "200");
  u.searchParams.set("page", String(page));
  return fetchJson<DiscoverPage>(u.toString());
}

async function movieDetail(tmdbKey: string, id: number): Promise<MovieDetail | null> {
  try {
    const u = new URL(`${TMDB_BASE}/movie/${id}`);
    u.searchParams.set("api_key", tmdbKey);
    u.searchParams.set("language", "en-US");
    return await fetchJson<MovieDetail>(u.toString());
  } catch {
    return null;
  }
}

function buildUserPrompt(m: DiscoverMovie, d: MovieDetail | null): string {
  const year = (m.release_date ?? d?.release_date ?? "").slice(0, 4) || "unknown";
  const runtime = d?.runtime ?? null;
  const genres = (d?.genres ?? []).map((g) => g.name).join(", ") || "unknown";
  const overview = (d?.overview || m.overview || "").slice(0, 800);
  return [
    `Title: ${m.title}`,
    `Year: ${year}`,
    `Runtime: ${runtime ?? "unknown"} min`,
    `Original language: ${m.original_language || d?.original_language || "unknown"}`,
    `Genres: ${genres}`,
    `Overview: ${overview}`,
  ].join("\n");
}

function clipAndValidate(arr: unknown): number[] | null {
  if (!Array.isArray(arr) || arr.length !== 7) return null;
  const out: number[] = [];
  for (const x of arr) {
    const n = typeof x === "number" ? x : Number(x);
    if (!Number.isFinite(n)) return null;
    out.push(Math.max(-1, Math.min(1, n)));
  }
  return out;
}

async function groqProfile(groqKey: string, userPrompt: string): Promise<number[] | null> {
  const body = {
    model: GROQ_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  };
  let raw: string;
  try {
    const resp = await fetchJson<{
      choices: { message: { content: string } }[];
    }>(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify(body),
    });
    raw = resp.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    console.warn("  groq error:", (e as Error).message);
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as { profile?: unknown };
    return clipAndValidate(parsed.profile);
  } catch {
    return null;
  }
}

async function readCheckpoint(): Promise<ProfileCache> {
  if (!existsSync(OUT_PATH)) return {};
  try {
    const txt = await readFile(OUT_PATH, "utf8");
    const parsed = JSON.parse(txt) as ProfileCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeCheckpoint(cache: ProfileCache): Promise<void> {
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(cache, null, 2), "utf8");
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
  await Promise.all(workers);
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const groqKey = process.env.GROQ_API_KEY;
  const tmdbKey = process.env.TMDB_API_KEY;

  if (!tmdbKey) {
    console.error("TMDB_API_KEY is required. Add it to .env.local or your shell.");
    process.exit(2);
  }
  if (!groqKey && !args.dryRun) {
    console.error("GROQ_API_KEY is not set. Re-run with --dry-run to preview, or export the key.");
    process.exit(2);
  }

  console.log(`stream-score DNA ingest`);
  console.log(`  mode=${args.dryRun ? "dry-run" : "live"} limit=${args.limit} pages=${args.pages}`);
  console.log(`  axes=${AXES.join(",")}`);
  console.log(`  output=${OUT_PATH}`);

  const cache = await readCheckpoint();
  console.log(`  existing cached profiles: ${Object.keys(cache).length}`);

  // Phase 1: discover candidates.
  console.log(`Discovering up to ${args.pages} TMDb pages…`);
  const movies: DiscoverMovie[] = [];
  const seen = new Set<number>();
  for (let p = 1; p <= args.pages && movies.length < args.limit; p++) {
    let page: DiscoverPage;
    try {
      page = await discoverPage(tmdbKey, p);
    } catch (e) {
      console.warn(`  discover page ${p} failed: ${(e as Error).message}`);
      break;
    }
    for (const r of page.results) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      movies.push(r);
      if (movies.length >= args.limit) break;
    }
    if (p >= page.total_pages) break;
    if (args.dryRun && p >= 1) break; // dry-run: only sample 1 page
  }
  console.log(`  discovered ${movies.length} candidates.`);

  const todo = movies.filter((m) => !cache[String(m.id)]);
  console.log(`  ${todo.length} need profiling (skipping ${movies.length - todo.length} cached).`);

  if (args.dryRun) {
    const sample = todo.slice(0, 3);
    console.log(`Dry-run: would call Groq for ${todo.length} movies.`);
    console.log(`  Groq model: ${GROQ_MODEL}`);
    console.log(`  System prompt length: ${SYSTEM_PROMPT.length} chars`);
    for (const m of sample) {
      const detail = await movieDetail(tmdbKey, m.id);
      const prompt = buildUserPrompt(m, detail);
      console.log(`\n  --- ${m.title} (${m.id}) ---`);
      console.log(prompt.split("\n").map((l) => "    " + l).join("\n"));
    }
    console.log(`\nNo Groq calls made. Re-run without --dry-run to ingest.`);
    return;
  }

  // Phase 2: enrich + profile, with parallelism + periodic checkpoints.
  let done = 0;
  let writtenSince = 0;
  const groqKeyConfirmed = groqKey!;
  await mapLimit(todo, GROQ_CONCURRENCY, async (m) => {
    const detail = await movieDetail(tmdbKey, m.id);
    const prompt = buildUserPrompt(m, detail);
    const profile = await groqProfile(groqKeyConfirmed, prompt);
    if (profile) cache[String(m.id)] = profile;
    done++;
    writtenSince++;
    if (writtenSince >= CHECKPOINT_INTERVAL) {
      writtenSince = 0;
      await writeCheckpoint(cache);
      console.log(`  checkpoint @ ${done}/${todo.length} (cache size ${Object.keys(cache).length})`);
    }
    if (done % 25 === 0) {
      process.stdout.write(`  ${done}/${todo.length}\r`);
    }
  });

  await writeCheckpoint(cache);
  console.log(`\nDone. Wrote ${Object.keys(cache).length} profiles to ${OUT_PATH}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
