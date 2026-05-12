// Pure-function rail-spec authoring.
//
// Given a `StoredDna` (or null) and the user's provider keys, return a list
// of `RailSpec` objects the home For-You view can render. Each rail is a
// pre-built TMDb-discover URLSearchParams blob with a copywriter-quality
// label and a one-sentence rationale for the tooltip.
//
// This module is pure — no fetches, no React, no localStorage. The rail
// query strings target `/api/discover` (which already accepts genres,
// year, sort, providers, and now `dna`).

import type { StoredDna } from "./storage";
import archetypesData from "../../../data/dna/archetypes.json";

interface ArchetypeRow {
  key: string;
  name: string;
  anchorFilm: { title: string; tmdbId: number; year: number };
}

const ARCHETYPES = archetypesData as unknown as ArchetypeRow[];
const ARCHETYPE_BY_KEY = new Map<string, ArchetypeRow>(
  ARCHETYPES.map((a) => [a.key, a]),
);

export interface RailSpec {
  id: string;
  label: string;
  rationale: string;
  query: URLSearchParams;
}

// Genre IDs that match TMDb's canonical movie list.
const G = {
  Action: 28,
  Adventure: 12,
  Animation: 16,
  Comedy: 35,
  Crime: 80,
  Documentary: 99,
  Drama: 18,
  Family: 10751,
  Fantasy: 14,
  History: 36,
  Horror: 27,
  Music: 10402,
  Mystery: 9648,
  Romance: 10749,
  ScienceFiction: 878,
  Thriller: 53,
  War: 10752,
  Western: 37,
} as const;

/**
 * Per-archetype "flavored" genre rail. Each line is intentionally
 * copy-edited; if you change the wording, also update the rationale.
 */
const ARCHETYPE_RAIL: Record<
  string,
  { label: string; rationale: string; genres: number[]; sort: string }
> = {
  slow_burn_romantic: {
    label: "Romance with teeth",
    rationale: "Yearning, distance, the slow turn — romance films that respect restraint.",
    genres: [G.Romance, G.Drama],
    sort: "vote_average.desc",
  },
  late_night_stylist: {
    label: "After-midnight neon",
    rationale: "Mood-first thrillers where the soundtrack does half the storytelling.",
    genres: [G.Thriller, G.Crime],
    sort: "vote_average.desc",
  },
  cerebral_adventurer: {
    label: "Sci-fi that thinks back",
    rationale: "Speculative films where the ideas are louder than the explosions.",
    genres: [G.ScienceFiction],
    sort: "vote_average.desc",
  },
  domestic_excavator: {
    label: "Quiet rooms, heavy weight",
    rationale: "Family dramas that earn every long take and unresolved silence.",
    genres: [G.Drama],
    sort: "vote_average.desc",
  },
  gleeful_maximalist: {
    label: "Everything, all at once",
    rationale: "Maximalist swings that try to be more — and pull it off.",
    genres: [G.Action, G.Adventure, G.Comedy],
    sort: "popularity.desc",
  },
  dread_cartographer: {
    label: "Slow horror, patient camera",
    rationale: "Horror that prefers geometry over jump scares.",
    genres: [G.Horror],
    sort: "vote_average.desc",
  },
  genre_mechanic: {
    label: "The craft is the point",
    rationale: "Action and thrillers where the choreography is the message.",
    genres: [G.Action, G.Thriller],
    sort: "vote_average.desc",
  },
  tender_absurdist: {
    label: "Symmetry and heartbreak",
    rationale: "Wry comedies that hide a serious ache under the dollhouse.",
    genres: [G.Comedy, G.Drama],
    sort: "vote_average.desc",
  },
  street_realist: {
    label: "Pavement-level pressure",
    rationale: "Crime and drama that sound like a city talking over itself.",
    genres: [G.Crime, G.Drama],
    sort: "vote_average.desc",
  },
  mythic_wanderer: {
    label: "Worlds to get lost in",
    rationale: "Fantasy and animation built like places — somewhere with its own gravity.",
    genres: [G.Fantasy, G.Animation, G.Adventure],
    sort: "vote_average.desc",
  },
};

function withCommon(params: URLSearchParams, providers: string[], dnaB64: string | null): URLSearchParams {
  if (providers.length) params.set("providers", providers.join(","));
  if (dnaB64) params.set("dna", dnaB64);
  if (!params.has("sort")) params.set("sort", "best");
  if (!params.has("page")) params.set("page", "1");
  return params;
}

/**
 * Encode a 7-vec to base64url (Float32 LE, 28 bytes → ~38 chars).
 * Mirrors the decoder in `/api/tonight`. Browser-safe; no Buffer.
 */
function encodeDnaB64Url(vec: number[]): string | null {
  if (!vec || vec.length !== 7) return null;
  try {
    const buf = new ArrayBuffer(28);
    const view = new DataView(buf);
    for (let i = 0; i < 7; i++) {
      const v = Math.max(-1, Math.min(1, Number(vec[i]) || 0));
      view.setFloat32(i * 4, v, true);
    }
    // Browser path
    if (typeof window !== "undefined") {
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = window.btoa(bin);
      return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    // Node fallback (used during SSR/tests).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const NodeBuffer = (globalThis as any).Buffer;
    if (NodeBuffer) {
      const b64 = NodeBuffer.from(buf).toString("base64");
      return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    return null;
  } catch {
    return null;
  }
}

export function buildRails(
  dna: StoredDna | null,
  providers: string[],
): RailSpec[] {
  const dnaB64 = dna ? encodeDnaB64Url(dna.vector) : null;
  const rails: RailSpec[] = [];

  const v = dna?.vector ?? [0, 0, 0, 0, 0, 0, 0];
  const lightDark = v[2] ?? 0; // + bright, - dark/mood
  const modernClassic = v[1] ?? 0; // + modern, - classic

  // 1. Tonight, distilled — generic DNA-led rail. Sorted by "best" so the
  //    rerank pipeline can lean on the DNA score.
  rails.push({
    id: "tonight-distilled",
    label: "Your tonight, distilled",
    rationale: "A high-quality slice the re-rank weights against your DNA most heavily.",
    query: withCommon(
      new URLSearchParams({ sort: "best", rating_min: "6" }),
      providers,
      dnaB64,
    ),
  });

  // 2. More-like-anchor — uses the anchor film's TMDb similar list via /api/discover
  //    can't fetch that directly, so we use the anchor's genres as a proxy and
  //    floor the year to ensure the rail isn't all anchor-era classics.
  if (dna) {
    const arch = ARCHETYPE_BY_KEY.get(dna.archetype);
    if (arch) {
      const params = new URLSearchParams({
        sort: "best",
        rating_min: "6",
      });
      rails.push({
        id: `like-anchor-${arch.anchorFilm.tmdbId}`,
        label: `More like ${arch.anchorFilm.title}`,
        rationale: `Same DNA family as your anchor film, ${arch.anchorFilm.title}.`,
        query: withCommon(params, providers, dnaB64),
      });
    }
  }

  // 3. Archetype-flavored genre rail.
  if (dna) {
    const flavored = ARCHETYPE_RAIL[dna.archetype];
    if (flavored) {
      const params = new URLSearchParams({
        sort: flavored.sort === "popularity.desc" ? "popular" : "best",
        genres: flavored.genres.join(","),
        rating_min: "6",
      });
      rails.push({
        id: `archetype-${dna.archetype}`,
        label: flavored.label,
        rationale: flavored.rationale,
        query: withCommon(params, providers, dnaB64),
      });
    }
  }

  // 4. Drama, tone-flexed by the lightDark axis.
  {
    const dark = lightDark <= 0;
    const params = new URLSearchParams({
      sort: "best",
      genres: String(G.Drama),
      rating_min: "6.5",
    });
    rails.push({
      id: "drama-tone",
      label: dark ? "Drama that doesn't flinch" : "Drama with warmth",
      rationale: dark
        ? "Heavier dramatic register — earned weight, not misery for sport."
        : "Dramas with light in them; the warmth is the point, not the bypass.",
      query: withCommon(params, providers, dnaB64),
    });
  }

  // 5. Sci-fi flexed by the modernClassic axis.
  {
    const modern = modernClassic >= 0;
    const params = new URLSearchParams({
      sort: "best",
      genres: String(G.ScienceFiction),
      rating_min: "6",
    });
    if (modern) {
      params.set("year_min", "2010");
    } else {
      params.set("year_max", "1999");
    }
    rails.push({
      id: "scifi-era",
      label: modern ? "Sci-fi for the modern-leaning" : "Sci-fi from the canon",
      rationale: modern
        ? "Recent speculative cinema with the post-2010 toolset."
        : "Canon sci-fi — the films that taught everyone else how to look at the future.",
      query: withCommon(params, providers, dnaB64),
    });
  }

  // 6. Comedies your DNA cosigns.
  {
    const params = new URLSearchParams({
      sort: "best",
      genres: String(G.Comedy),
      rating_min: "6.5",
    });
    rails.push({
      id: "comedies",
      label: "Comedies your DNA cosigns",
      rationale: "Comedy is taste-sensitive — these are the ones that match your axis lean.",
      query: withCommon(params, providers, dnaB64),
    });
  }

  // 7. The deep cut — vote_count gated to mid-tier so the rail surfaces
  //    underseen films. The discover route enforces a 50-vote floor by
  //    default; we don't have an upper bound there, so we lean on DNA + a
  //    rating floor and trust the rerank to surface lower-popularity hits.
  {
    const params = new URLSearchParams({
      sort: "best",
      rating_min: "7",
    });
    rails.push({
      id: "deep-cut",
      label: "The deep cut",
      rationale: "Quietly excellent films — mid-popularity, high signal-to-noise.",
      query: withCommon(params, providers, dnaB64),
    });
  }

  return rails;
}
