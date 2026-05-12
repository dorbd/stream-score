// stream·score DNA — share-token store.
//
// A share token is an 8-character base62 string that maps to a tiny
// payload `{archetypeKey, voiceVariant, createdAt}`. The whole point of
// keeping it tiny is GDPR cleanliness — we never persist the user's 7-vec
// or their raw answers server-side (DSCI ruling #6). The receiver only
// needs enough info to re-render the reveal page in the original voice.
//
// Backing store: in-memory `Map`. Replace with Upstash KV (or any KV)
// when traffic outgrows a single Node process — the swap point is the
// `put`/`get` pair below.

import type { VoiceVariant } from "./storage";

const TOKEN_LENGTH = 8;
const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export interface ArchetypeShare {
  archetypeKey: string;
  voiceVariant: VoiceVariant;
  createdAt: number;
}

// ---- In-memory KV ----------------------------------------------------------
//
// We keep this on `globalThis` so it survives Next's dev-server hot reloads,
// which otherwise re-import this module and reset the Map. In production the
// module is loaded once per server instance, so this is a no-op cost.

interface GlobalWithKv {
  __streamScoreDnaShareKv?: Map<string, ArchetypeShare>;
}

function getKv(): Map<string, ArchetypeShare> {
  const g = globalThis as GlobalWithKv;
  if (!g.__streamScoreDnaShareKv) {
    g.__streamScoreDnaShareKv = new Map<string, ArchetypeShare>();
  }
  return g.__streamScoreDnaShareKv;
}

// ---- Token generation ------------------------------------------------------

function randomBase62Char(): string {
  // Web Crypto is available in Edge runtime and modern Node (>=18). Falling
  // back to Math.random keeps us covered for the unlikely event it isn't.
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint8Array(1);
    // Reject sampling to avoid modulo bias when 256 % 62 != 0.
    // 256 % 62 = 8, so we discard the top 8 values (248..255).
    while (true) {
      crypto.getRandomValues(buf);
      if (buf[0] < 248) return BASE62[buf[0] % 62];
    }
  }
  return BASE62[Math.floor(Math.random() * 62)];
}

/** Generate a fresh 8-char base62 token. ~62^8 ≈ 2.18e14 keyspace. */
export function generateToken(): string {
  let out = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) out += randomBase62Char();
  return out;
}

/** True when `t` matches the base62/length contract. */
export function isValidTokenShape(t: unknown): t is string {
  if (typeof t !== "string") return false;
  if (t.length !== TOKEN_LENGTH) return false;
  for (let i = 0; i < t.length; i++) {
    if (BASE62.indexOf(t[i]) < 0) return false;
  }
  return true;
}

// ---- Public API ------------------------------------------------------------

/** Persist a share record under `token`. Last-write-wins on collision. */
export function putShareToken(token: string, share: ArchetypeShare): void {
  if (!isValidTokenShape(token)) {
    throw new Error("putShareToken: token must be 8-char base62.");
  }
  getKv().set(token, share);
}

/** Look up a share record, or `null` if absent. */
export function getShareToken(token: string): ArchetypeShare | null {
  if (!isValidTokenShape(token)) return null;
  return getKv().get(token) ?? null;
}

/**
 * Generate a unique-among-current-entries token + put the share record.
 * Returns the token. At our scale, a single attempt almost always wins;
 * the loop is defensive for future Upstash backends.
 */
export function createShareToken(share: ArchetypeShare): string {
  const kv = getKv();
  for (let attempt = 0; attempt < 5; attempt++) {
    const t = generateToken();
    if (!kv.has(t)) {
      kv.set(t, share);
      return t;
    }
  }
  // Astronomically unlikely; surface a 500 to the caller.
  throw new Error("createShareToken: failed to find unused token after 5 attempts.");
}
