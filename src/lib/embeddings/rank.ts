// Brute-force cosine similarity ranker over the precomputed embedding
// blob produced by `build.ts`. The blob is loaded once on module init
// (lazy — first call to `rankAlts()` triggers it) and held in memory
// for the lifetime of the server process. If the file isn't present we
// return null and let the caller fall back to a non-embedding path.

import { promises as fs } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";

const gunzip = promisify(zlib.gunzip);
const BLOB_PATH = path.resolve(process.cwd(), "data/embeddings.bin.gz");

interface LoadedBlob {
  ids: Int32Array;
  // Flattened [N * D] f32 array, l2-normalized so cosine reduces to dot.
  vectors: Float32Array;
  dim: number;
  count: number;
}

let cached: LoadedBlob | null = null;
let loadPromise: Promise<LoadedBlob | null> | null = null;

async function loadBlob(): Promise<LoadedBlob | null> {
  try {
    const gz = await fs.readFile(BLOB_PATH);
    const buf = await gunzip(gz);
    if (buf.byteLength < 8) return null;
    const N = buf.readUInt32LE(0);
    const D = buf.readUInt32LE(4);
    const recordBytes = 4 + D * 4;
    if (buf.byteLength < 8 + N * recordBytes) return null;
    const ids = new Int32Array(N);
    const vectors = new Float32Array(N * D);
    for (let i = 0; i < N; i++) {
      const offset = 8 + i * recordBytes;
      ids[i] = buf.readInt32LE(offset);
      // Float32 view over the raw bytes for this record's vector.
      const view = new Float32Array(buf.buffer, buf.byteOffset + offset + 4, D);
      // L2-normalize as we copy in so query time becomes a dot product.
      let norm = 0;
      for (let k = 0; k < D; k++) norm += view[k] * view[k];
      const scale = norm > 0 ? 1 / Math.sqrt(norm) : 0;
      const base = i * D;
      for (let k = 0; k < D; k++) vectors[base + k] = view[k] * scale;
    }
    return { ids, vectors, dim: D, count: N };
  } catch {
    return null;
  }
}

async function ensureLoaded(): Promise<LoadedBlob | null> {
  if (cached) return cached;
  if (!loadPromise) {
    loadPromise = loadBlob().then((b) => {
      cached = b;
      return b;
    });
  }
  return loadPromise;
}

export interface RankAltsArgs {
  // The anchor fingerprint vector, length must match blob.dim. If the
  // 8-dim anchor fingerprint is being passed instead, the caller is
  // responsible for projecting it into the embedding space first; that
  // pipeline doesn't exist yet, so callers will typically pass a true
  // OpenAI embedding here (e.g. of the anchor title's overview).
  query: Float32Array;
  excludeIds?: ReadonlySet<number>;
  topK?: number;
}

export interface RankedAlt {
  tmdbId: number;
  score: number; // cosine similarity, ~[0..1]
}

// Returns null if the embedding blob is unavailable (file missing /
// malformed). Callers should fall back.
export async function rankAlts(args: RankAltsArgs): Promise<RankedAlt[] | null> {
  const blob = await ensureLoaded();
  if (!blob) return null;
  const { ids, vectors, dim, count } = blob;
  if (args.query.length !== dim) return null;

  // L2-normalize the query so similarity = dot product.
  let qnorm = 0;
  for (let i = 0; i < dim; i++) qnorm += args.query[i] * args.query[i];
  const qscale = qnorm > 0 ? 1 / Math.sqrt(qnorm) : 0;
  const q = new Float32Array(dim);
  for (let i = 0; i < dim; i++) q[i] = args.query[i] * qscale;

  const topK = Math.max(1, args.topK ?? 50);
  const exclude = args.excludeIds;
  // Min-heap-ish: keep a small sorted array of the top scores so far.
  const heap: RankedAlt[] = [];
  for (let i = 0; i < count; i++) {
    const id = ids[i];
    if (exclude && exclude.has(id)) continue;
    let dot = 0;
    const base = i * dim;
    for (let k = 0; k < dim; k++) dot += vectors[base + k] * q[k];
    if (heap.length < topK) {
      heap.push({ tmdbId: id, score: dot });
      heap.sort((a, b) => a.score - b.score);
    } else if (dot > heap[0].score) {
      heap[0] = { tmdbId: id, score: dot };
      heap.sort((a, b) => a.score - b.score);
    }
  }
  return heap.sort((a, b) => b.score - a.score);
}

export async function isEmbeddingsReady(): Promise<boolean> {
  return (await ensureLoaded()) != null;
}
