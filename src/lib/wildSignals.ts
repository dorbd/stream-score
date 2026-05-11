// "Wild" signals: things you don't usually mine for movie recs.
// - Wikipedia "On This Day" historical events → period / theme keywords
// - TMDb /person/popular sweep → who was born/died today → tribute picks
// - NASA Astronomy Picture of the Day → if title mentions space stuff, lean sci-fi
//
// All calls are cached aggressively and degrade gracefully on failure.

export interface OnThisDayEvent {
  year: number;
  text: string;
  keywords: string[];
  /** TMDb genre IDs implied by this event. */
  genreHints: number[];
}

export interface WildSignals {
  /** A whimsical sentence to surface in the UI rubric. */
  rubric: string | null;
  /** TMDb genre IDs (with a magnitude) we should bump tonight. */
  genreBoosts: Record<number, number>;
  /** TMDb person IDs born today (anniversary), max 5. */
  bornTodayIds: number[];
  /** TMDb person IDs who died on this day in history (max 5). */
  diedTodayIds: number[];
  /** Lower-cased keywords to give cheap bonus to a movie if its overview contains any. */
  keywordHints: string[];
}

const G = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80,
  Doc: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36,
  Horror: 27, Mystery: 9648, Romance: 10749, SciFi: 878, Thriller: 53,
  War: 10752, Western: 37,
};

// Heuristic keyword → genre hint table
const KW_TO_GENRES: { kw: RegExp; genres: number[]; nice: string }[] = [
  { kw: /moon|mars|orbit|astronaut|nasa|comet|asteroid|planet|space|galaxy|telescope|eclipse/i, genres: [G.SciFi, G.Adventure], nice: "space" },
  { kw: /war|battle|invasion|treaty|soldier|army|navy/i, genres: [G.War, G.History, G.Drama], nice: "war" },
  { kw: /assassinat|murder|shot dead|killed|gunman/i, genres: [G.Crime, G.Thriller], nice: "crime" },
  { kw: /elect|president|prime minister|parliament|coronation|inaugurat/i, genres: [G.History, G.Drama], nice: "politics" },
  { kw: /storm|hurricane|earthquake|volcano|tsunami|flood|wildfire/i, genres: [G.Drama, G.Action], nice: "disaster" },
  { kw: /pope|saint|church|catholic|monk|nun/i, genres: [G.History, G.Drama], nice: "religion" },
  { kw: /scientist|physic|chemist|biolog|discover|invent|patent/i, genres: [G.Doc, G.Drama], nice: "discovery" },
  { kw: /artist|painter|musician|composer|opera|symphony|premiere/i, genres: [G.Drama, G.History], nice: "the arts" },
  { kw: /train|locomotive|railroad|railway/i, genres: [G.Western, G.Adventure], nice: "railway" },
  { kw: /ship|sinking|wreck|sea|titanic|ocean/i, genres: [G.Adventure, G.Drama], nice: "the sea" },
  { kw: /heist|bank robbery|stolen/i, genres: [G.Crime, G.Action], nice: "heist" },
];

function eventKeywords(text: string): { keywords: string[]; genres: number[] } {
  const genres = new Set<number>();
  const keywords = new Set<string>();
  for (const { kw, genres: g, nice } of KW_TO_GENRES) {
    if (kw.test(text)) {
      keywords.add(nice);
      for (const id of g) genres.add(id);
    }
  }
  return { keywords: [...keywords], genres: [...genres] };
}

async function getOnThisDayEvents(): Promise<OnThisDayEvent[]> {
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const url = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${m}/${d}`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: { year: number; text: string }[] };
    const events = data.events ?? [];
    // Keep most notable: bias to round-number anniversaries and newer events.
    const thisYear = now.getFullYear();
    const scored = events
      .filter((e) => e.year >= 1700)
      .map((e) => {
        const age = thisYear - e.year;
        const roundBoost =
          age % 100 === 0 ? 5 : age % 50 === 0 ? 4 : age % 25 === 0 ? 3 : age % 10 === 0 ? 2 : 0;
        const recencyBoost = age <= 50 ? 1 : 0;
        return { e, score: roundBoost + recencyBoost - Math.log10(age + 1) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return scored.map(({ e }) => {
      const k = eventKeywords(e.text);
      return { year: e.year, text: e.text, keywords: k.keywords, genreHints: k.genres };
    });
  } catch {
    return [];
  }
}

interface NasaApod {
  title?: string;
  explanation?: string;
}

async function getNasaApod(): Promise<NasaApod | null> {
  try {
    const res = await fetch(`https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY`, {
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!res.ok) return null;
    return (await res.json()) as NasaApod;
  } catch {
    return null;
  }
}

interface TmdbPerson {
  id: number;
  name: string;
  birthday?: string | null;
  deathday?: string | null;
}

async function tmdb<T>(path: string, query?: Record<string, string>): Promise<T | null> {
  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  const url = new URL("https://api.themoviedb.org/3" + path);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "en-US");
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Sweep 2 pages of /person/popular, fetch detail for each, find any born/died today. */
async function getBornDiedToday(): Promise<{ bornTodayIds: number[]; diedTodayIds: number[] }> {
  const popular = await Promise.all([
    tmdb<{ results: TmdbPerson[] }>("/person/popular", { page: "1" }),
    tmdb<{ results: TmdbPerson[] }>("/person/popular", { page: "2" }),
  ]);
  const ids = [
    ...(popular[0]?.results ?? []),
    ...(popular[1]?.results ?? []),
  ].map((p) => p.id);
  // Skip if no TMDb key
  if (ids.length === 0) return { bornTodayIds: [], diedTodayIds: [] };

  const details = await Promise.all(ids.map((id) => tmdb<TmdbPerson>(`/person/${id}`)));
  const now = new Date();
  const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const bornTodayIds: number[] = [];
  const diedTodayIds: number[] = [];
  for (const d of details) {
    if (!d) continue;
    if (d.birthday && d.birthday.slice(5) === mmdd) bornTodayIds.push(d.id);
    if (d.deathday && d.deathday.slice(5) === mmdd) diedTodayIds.push(d.id);
  }
  return { bornTodayIds: bornTodayIds.slice(0, 5), diedTodayIds: diedTodayIds.slice(0, 5) };
}

/** For a tribute person, fetch their top-rated movie credits (TMDb ids). */
export async function getTributeMovieIds(personIds: number[]): Promise<Set<number>> {
  if (!personIds.length) return new Set();
  const credits = await Promise.all(
    personIds.map((id) =>
      tmdb<{ cast?: { id: number; vote_average?: number; vote_count?: number }[] }>(
        `/person/${id}/movie_credits`,
      ),
    ),
  );
  const out = new Set<number>();
  for (const r of credits) {
    const top = (r?.cast ?? [])
      .filter((c) => (c.vote_count ?? 0) >= 500 && (c.vote_average ?? 0) >= 7)
      .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
      .slice(0, 4);
    for (const m of top) out.add(m.id);
  }
  return out;
}

export async function getWildSignals(): Promise<WildSignals> {
  const [events, apod, bornDied] = await Promise.all([
    getOnThisDayEvents(),
    getNasaApod(),
    getBornDiedToday(),
  ]);

  // Pick the highest-scored event for the rubric.
  const topEvent = events[0];
  let rubric: string | null = null;
  if (topEvent) {
    const cleanText = topEvent.text.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    rubric = `On this day in ${topEvent.year}: ${cleanText}`;
  }

  // Genre boosts: aggregate event hints (modest) + APOD title boost.
  const genreBoosts: Record<number, number> = {};
  for (const e of events) {
    for (const g of e.genreHints) {
      genreBoosts[g] = (genreBoosts[g] ?? 0) + 0.2;
    }
  }
  if (apod?.title) {
    const k = eventKeywords(apod.title + " " + (apod.explanation ?? ""));
    for (const g of k.genres) {
      genreBoosts[g] = (genreBoosts[g] ?? 0) + 0.3;
    }
  }
  // Normalize 0..1
  for (const k of Object.keys(genreBoosts)) {
    const id = Number(k);
    genreBoosts[id] = Math.min(1, genreBoosts[id]);
  }

  // Keyword bonuses
  const keywordHints = Array.from(
    new Set([
      ...events.flatMap((e) => e.keywords),
      ...(apod?.title ? eventKeywords(apod.title).keywords : []),
    ]),
  );

  return {
    rubric,
    genreBoosts,
    bornTodayIds: bornDied.bornTodayIds,
    diedTodayIds: bornDied.diedTodayIds,
    keywordHints,
  };
}
