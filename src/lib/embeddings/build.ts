// Offline embedding builder. Run ONCE locally:
//
//   npx tsx src/lib/embeddings/build.ts
//
// Pulls TMDb's `/movie/popular` pages, embeds the (title + tagline +
// overview) blob with OpenAI `text-embedding-3-small@384`, and writes
// the result as a gzipped little-endian binary blob at
// `data/embeddings.bin.gz`. The on-disk layout is:
//
//   [u32 le N][u32 le D]( [i32 le tmdbId][f32 le D vector] ) * N
//
// Skippable: if OPENAI_API_KEY isn't set, we exit 0 with a console
// message so CI doesn't fail.

import { promises as fs } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";

const gzip = promisify(zlib.gzip);

const TARGET_COUNT = 10_000;
const PAGE_SIZE = 20; // TMDb default
const TOTAL_PAGES = Math.ceil(TARGET_COUNT / PAGE_SIZE);
const EMBED_DIM = 384;
const OPENAI_MODEL = "text-embedding-3-small";
const OPENAI_BATCH = 96; // OpenAI accepts up to 2048 inputs but text is heavy.
const OUT_PATH = path.resolve(process.cwd(), "data/embeddings.bin.gz");

interface RawMovie {
  id: number;
  title: string;
  overview: string;
  tagline?: string;
  release_date?: string;
}

interface TmdbPopularResp {
  page: number;
  total_pages: number;
  results: RawMovie[];
}

async function fetchPopular(page: number, apiKey: string): Promise<RawMovie[]> {
  const url = new URL("https://api.themoviedb.org/3/movie/popular");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("page", String(page));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDb popular page ${page}: ${res.status}`);
  const body = (await res.json()) as TmdbPopularResp;
  return body.results ?? [];
}

async function embedBatch(texts: string[], apiKey: string): Promise<Float32Array[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model: OPENAI_MODEL,
      dimensions: EMBED_DIM,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings ${res.status}: ${t.slice(0, 300)}`);
  }
  const body = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };
  // Re-sort by index since the API technically can return out-of-order.
  const out = new Array<Float32Array>(texts.length);
  for (const row of body.data) {
    out[row.index] = new Float32Array(row.embedding);
  }
  return out;
}

function buildText(m: RawMovie): string {
  const year = m.release_date ? m.release_date.slice(0, 4) : "";
  const tag = m.tagline ? m.tagline.trim() : "";
  const ov = m.overview ? m.overview.trim() : "";
  return [m.title, year, tag, ov].filter(Boolean).join(" — ").slice(0, 1200);
}

async function main(): Promise<void> {
  const tmdbKey = process.env.TMDB_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!tmdbKey) {
    console.error("TMDB_API_KEY not set — refusing to run.");
    process.exit(0);
  }
  if (!openaiKey) {
    console.log("OPENAI_API_KEY not set — skipping embedding build (this is fine for local dev).");
    process.exit(0);
  }

  console.log(`Fetching ${TOTAL_PAGES} pages of TMDb popular...`);
  const movies: RawMovie[] = [];
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    try {
      const page = await fetchPopular(p, tmdbKey);
      movies.push(...page);
    } catch (e) {
      console.warn(`page ${p} failed:`, e);
    }
    if (p % 25 === 0) console.log(`  ${movies.length} pulled...`);
  }
  // Deduplicate by id and drop any without overview text.
  const seen = new Set<number>();
  const filtered = movies.filter((m) => {
    if (!m.id || seen.has(m.id)) return false;
    seen.add(m.id);
    return Boolean(m.overview && m.overview.trim().length > 10);
  });
  console.log(`Embedding ${filtered.length} unique movies...`);

  // Allocate the dense buffer up front.
  const N = filtered.length;
  const recordBytes = 4 + EMBED_DIM * 4;
  const buf = Buffer.alloc(8 + N * recordBytes);
  buf.writeUInt32LE(N, 0);
  buf.writeUInt32LE(EMBED_DIM, 4);

  let written = 0;
  for (let i = 0; i < N; i += OPENAI_BATCH) {
    const batch = filtered.slice(i, i + OPENAI_BATCH);
    const texts = batch.map(buildText);
    let vecs: Float32Array[];
    try {
      vecs = await embedBatch(texts, openaiKey);
    } catch (e) {
      console.warn(`batch starting ${i} failed:`, e);
      continue;
    }
    for (let j = 0; j < batch.length; j++) {
      const v = vecs[j];
      if (!v || v.length !== EMBED_DIM) continue;
      const offset = 8 + (i + j) * recordBytes;
      buf.writeInt32LE(batch[j].id, offset);
      Buffer.from(v.buffer).copy(buf, offset + 4);
      written++;
    }
    if (i % (OPENAI_BATCH * 10) === 0) {
      console.log(`  ${written}/${N} embedded`);
    }
  }
  console.log(`Done — ${written}/${N} records embedded. Gzipping...`);

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  const gz = await gzip(buf);
  await fs.writeFile(OUT_PATH, gz);
  console.log(`Wrote ${OUT_PATH} (${(gz.byteLength / 1024 / 1024).toFixed(1)} MB gzipped).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
