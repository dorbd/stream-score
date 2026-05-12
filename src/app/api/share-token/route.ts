// /api/share-token
//
// POST  { archetypeKey, voiceVariant } → { token: string }
// GET   ?t=<token>                     → { archetypeKey, voiceVariant, createdAt }
//
// The whole point of this endpoint is GDPR cleanliness — DSCI ruling #6
// said we may never store the user's 7-vec or raw answers server-side.
// All we keep is the archetype key + voice variant, which is exactly
// enough for the receiving browser to re-render the reveal page.

import { NextRequest, NextResponse } from "next/server";
import archetypesData from "@/../data/dna/archetypes.json";
import {
  createShareToken,
  getShareToken,
  isValidTokenShape,
} from "@/lib/dna/shareToken";
import type { VoiceVariant } from "@/lib/dna/storage";

interface ArchetypeRow {
  key: string;
}
const ARCHETYPES = archetypesData as ArchetypeRow[];
const ARCHETYPE_KEYS = new Set<string>(ARCHETYPES.map((a) => a.key));

const VOICE_SET = new Set<VoiceVariant>([
  "playful",
  "intellectual",
  "dry",
  "warm",
  "blunt",
  "poetic",
  "skeptical",
  "bright",
]);

function isVoiceVariant(x: unknown): x is VoiceVariant {
  return typeof x === "string" && VOICE_SET.has(x as VoiceVariant);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Body must be an object with archetypeKey + voiceVariant." },
      { status: 400 },
    );
  }
  const { archetypeKey, voiceVariant } = body as Record<string, unknown>;

  if (typeof archetypeKey !== "string" || !ARCHETYPE_KEYS.has(archetypeKey)) {
    return NextResponse.json(
      { error: "archetypeKey is missing or unknown." },
      { status: 400 },
    );
  }
  if (!isVoiceVariant(voiceVariant)) {
    return NextResponse.json(
      { error: "voiceVariant is missing or invalid." },
      { status: 400 },
    );
  }

  try {
    const token = createShareToken({
      archetypeKey,
      voiceVariant,
      createdAt: Date.now(),
    });
    return NextResponse.json({ token });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("t");
  if (!token || !isValidTokenShape(token)) {
    return NextResponse.json(
      { error: "Query param 't' must be an 8-char base62 token." },
      { status: 400 },
    );
  }
  const share = getShareToken(token);
  if (!share) {
    return NextResponse.json({ error: "Token not found." }, { status: 404 });
  }
  return NextResponse.json(share);
}
