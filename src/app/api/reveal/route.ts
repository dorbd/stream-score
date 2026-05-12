// GET /api/reveal?archetype=<key>&voice=<variant>
//
// Returns `{ paragraph, voice, archetype }` — a single ~60-word paragraph
// in the requested voice, referencing the archetype's anchor film + one
// supporting touchstone + one specific moment the viewer would love.
//
// Generation: Groq Llama 3.3 70B Versatile, temperature 0.7, JSON-mode,
// max ~80 words. The whole product has 10 archetypes × 8 voices = 80
// possible (archetype + voice) keys, all cached in-memory for the
// process lifetime. Cost is rounding-error.
//
// When GROQ_API_KEY is unset, we serve a hand-written fallback per
// archetype (neutral voice). The fallbacks live below the handler and
// were written in the voice of the Forum's cinephile (Critic #6).

import { NextRequest, NextResponse } from "next/server";
import archetypesData from "@/../data/dna/archetypes.json";
import type { VoiceVariant } from "@/lib/dna/storage";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ---- Voice style guides ---------------------------------------------------
//
// Short, prescriptive sentences. The model anchors on these to set tone.

const VOICE_GUIDES: Record<VoiceVariant, string> = {
  playful:
    "Light on its feet. Quick rhythm. Lean toward wit, but never glib. One small, surprising image is fine.",
  intellectual:
    "Precise diction. Quietly confident. References allowed but unshowy. Trust the reader's vocabulary.",
  dry:
    "Spare. Understated. No exclamation. One observation that lands without straining.",
  warm:
    "Generous. Second-person feels like a friend recommending a chair. No saccharine — earn the warmth.",
  blunt:
    "Short clauses. Direct address. No qualifiers. Land the punch on the last line.",
  poetic:
    "Image-led. Long-breath sentences allowed. One sensual detail. Earn every line break.",
  skeptical:
    "Slightly raised eyebrow. The reader is being read back, and they know it. Withhold approval until the close.",
  bright:
    "Open palette. Enthusiasm without inflation. A sense of wonder grounded in craft, not hype.",
};

// ---- Archetype lookup -----------------------------------------------------

interface ArchetypeRow {
  key: string;
  name: string;
  tagline: string;
  anchorFilm: { title: string; tmdbId: number; year: number };
  anchorDirector: string;
  centroid: number[];
}

const ARCHETYPES = archetypesData as ArchetypeRow[];
const ARCHETYPE_BY_KEY = new Map<string, ArchetypeRow>(
  ARCHETYPES.map((a) => [a.key, a]),
);

// ---- Supporting touchstones ----------------------------------------------
//
// One additional film per archetype. The reveal prompt instructs the model
// to lean on these as a "and if you loved X..." beat. They were chosen to
// sit one notch off the anchor — same family, different angle.

const SUPPORTING_TOUCHSTONES: Record<string, { title: string; director: string }> = {
  slow_burn_romantic: { title: "Past Lives", director: "Celine Song" },
  late_night_stylist: { title: "Collateral", director: "Michael Mann" },
  cerebral_adventurer: { title: "Arrival", director: "Denis Villeneuve" },
  domestic_excavator: { title: "A Separation", director: "Asghar Farhadi" },
  gleeful_maximalist: { title: "Speed Racer", director: "The Wachowskis" },
  dread_cartographer: { title: "The Witch", director: "Robert Eggers" },
  genre_mechanic: { title: "Heat", director: "Michael Mann" },
  tender_absurdist: { title: "Punch-Drunk Love", director: "Paul Thomas Anderson" },
  street_realist: { title: "Good Time", director: "Josh & Benny Safdie" },
  mythic_wanderer: { title: "The Green Knight", director: "David Lowery" },
};

// ---- Hand-written fallback paragraphs ------------------------------------
//
// One per archetype, ~60 words, neutral voice. Each references the
// anchor film, one supporting touchstone, and one specific moment.
// These ship as the no-Groq fallback and as the seed value for the cache
// the first time a (archetype, voice) pair is requested before the LLM
// returns.

const FALLBACK_PARAGRAPHS: Record<string, string> = {
  slow_burn_romantic:
    "You watch In the Mood for Love for the corridor scenes — two people brushing past each other in slow motion while Shigeru Umebayashi's strings refuse to resolve. You believe restraint is a love language. Past Lives sits on the same shelf for you: that final taxi shot, two faces refusing to grieve out loud, says more than any embrace could.",
  late_night_stylist:
    "Drive lives in your head as a single image — Gosling in the elevator, lights dimming, the kiss arriving a half-second before the violence. You don't need the plot to make sense; you need the synths to hum and the neon to bleed into wet asphalt. Collateral does it from the other angle: Mann's LA at 3 a.m., where the cabbie's mirror frames a city that won't quite resolve.",
  cerebral_adventurer:
    "Annihilation's lighthouse pulled you in because the scariest thing wasn't the bear — it was that the doppelganger moves first, and Garland refuses to say what that means. You want sci-fi that respects the unanswered. Arrival's late reveal, the hand on the steamed glass, lands the same way: an idea you can feel before you can name.",
  domestic_excavator:
    "Manchester by the Sea opens with a man unable to apologise, and you understand the architecture immediately. You watch films for the long pauses in kitchens — for Lonergan letting a phone call run its full, unbearable length. A Separation is the same furniture rearranged: the moment a daughter chooses, and the camera refuses to look away from her face.",
  gleeful_maximalist:
    "Everything Everywhere All at Once asks if you can love your mother and also two rocks on a hillside, and your answer was yes, obviously. You came up cheering for the hot-dog hands. The Wachowskis' Speed Racer scratches the same itch — the cross-fade kaleidoscope of the final race, every frame trying to be more, succeeding because it never apologises.",
  dread_cartographer:
    "Hereditary's clucking sound — the moment in the bedroom when Toni Collette turns her head wrong — is your barometer for whether a horror film is paying attention. You don't want jump scares. You want geometry. The Witch gave you the same gift: Eggers' wide static frame on the cornfield, knowing the worst thing is the patience of it.",
  genre_mechanic:
    "You watched the Fallout bathroom fight three times in a row and rewound the helicopter sequence on the fourth. Plot is the excuse; the craft is the point. Heat is the same religion practiced louder: the downtown shootout, Mann letting the brass hit pavement so you can hear every shell, and de Niro and Pacino across a diner table, knowing.",
  tender_absurdist:
    "The Grand Budapest Hotel's funicular bell rings for you. Wes Anderson's whole architecture — the symmetry, the diorama colours, M. Gustave reciting poetry mid-prison-break — disguises a real ache underneath. Punch-Drunk Love does the same trick with fewer doll-house edges: PTA letting Sandler crumple in a phone booth, harmonium swelling, love rendered as a panic attack you survive.",
  street_realist:
    "Uncut Gems is a panic attack with a basketball game inside it, and you came out of the credits buzzing. You want the camera to sweat. You want overlapping dialogue and the wrong song playing too loud in the next room. Good Time gives you the same Safdie nervous system: Pattinson at the police station, lying with his whole face, Oneohtrix Point Never's score grinding underneath.",
  mythic_wanderer:
    "Spirited Away earned its place because the bathhouse has weather — Miyazaki built a world that exhales without you. You watch films to be a guest somewhere with its own gravity. The Green Knight is the same impulse routed through fog: Dev Patel kneeling in that final chamber, the camera waiting, the myth refusing to flinch from its own arithmetic.",
};

// ---- Response cache (archetype + voice) ----------------------------------

interface CacheEntry {
  paragraph: string;
  at: number;
}
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days — content is stable.
const responseCache = new Map<string, CacheEntry>();

function cacheKey(archetype: string, voice: VoiceVariant): string {
  return `${archetype}::${voice}`;
}

// ---- Validation ----------------------------------------------------------

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

function isVoiceVariant(x: string | null): x is VoiceVariant {
  return !!x && VOICE_SET.has(x as VoiceVariant);
}

// ---- Groq call -----------------------------------------------------------

async function generateWithGroq(
  archetype: ArchetypeRow,
  voice: VoiceVariant,
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const support = SUPPORTING_TOUCHSTONES[archetype.key];
  const voiceGuide = VOICE_GUIDES[voice];

  const system = [
    "You are stream·score's voice — a movie obsessive writing one paragraph identifying a viewer's taste type.",
    `Style guide for "${voice}": ${voiceGuide}`,
    "Reference the anchor film and one supporting touchstone. End with one specific moment they'd love.",
    "Hard limit: 60 words. Never use the words 'iconic' or 'masterpiece'. No sycophancy.",
    'Respond ONLY as JSON of shape {"paragraph": string}.',
  ].join(" ");

  const user = [
    `Archetype: ${archetype.name} — "${archetype.tagline}"`,
    `Anchor film: ${archetype.anchorFilm.title} (${archetype.anchorFilm.year}), dir. ${archetype.anchorDirector}.`,
    support
      ? `Supporting touchstone: ${support.title}, dir. ${support.director}.`
      : "",
    "Write the paragraph now.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.7,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    const raw = body.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { paragraph?: unknown };
    if (typeof parsed.paragraph !== "string") return null;
    const cleaned = parsed.paragraph.trim();
    if (cleaned.length === 0) return null;
    // Guard against banned words slipping through.
    if (/\b(iconic|masterpiece)\b/i.test(cleaned)) return null;
    return cleaned;
  } catch {
    return null;
  }
}

// ---- Handler -------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  const archetypeKey = params.get("archetype");
  const voiceParam = params.get("voice");

  if (!archetypeKey) {
    return NextResponse.json(
      { error: "Missing required query param 'archetype'." },
      { status: 400 },
    );
  }
  const archetype = ARCHETYPE_BY_KEY.get(archetypeKey);
  if (!archetype) {
    return NextResponse.json(
      { error: `Unknown archetype '${archetypeKey}'.` },
      { status: 404 },
    );
  }

  const voice: VoiceVariant = isVoiceVariant(voiceParam) ? voiceParam : "warm";

  const key = cacheKey(archetypeKey, voice);
  const hit = responseCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({
      paragraph: hit.paragraph,
      voice,
      archetype: archetypeKey,
    });
  }

  // Try Groq; if it fails or the key is missing, fall back to the
  // hand-written paragraph (which is voice-neutral but always good).
  const generated = await generateWithGroq(archetype, voice);
  const paragraph = generated ?? FALLBACK_PARAGRAPHS[archetypeKey] ?? archetype.tagline;

  responseCache.set(key, { paragraph, at: Date.now() });

  return NextResponse.json({
    paragraph,
    voice,
    archetype: archetypeKey,
  });
}
