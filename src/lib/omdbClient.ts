// Server-side OMDb client. Used to fetch IMDb/RT/Metacritic ratings by IMDb ID.
import type { OmdbRatings } from "./types";

const BASE = "https://www.omdbapi.com/";

interface RawOmdb {
  Response: "True" | "False";
  Error?: string;
  imdbRating?: string;
  imdbVotes?: string;
  Rated?: string;
  Awards?: string;
  Ratings?: { Source: string; Value: string }[];
  Metascore?: string;
}

export function isOmdbEnabled(): boolean {
  return Boolean(process.env.OMDB_API_KEY);
}

function parsePercent(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseRatio(v: string | undefined): number | null {
  // e.g. "8.4/10" -> 8.4
  if (!v) return null;
  const m = v.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+)/);
  if (m) {
    const num = Number(m[1]);
    const den = Number(m[2]);
    if (den > 0) return num;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseImdbVotes(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function getOmdbByImdbId(
  imdbId: string,
): Promise<OmdbRatings | null> {
  const key = process.env.OMDB_API_KEY;
  if (!key) return null;
  if (!imdbId.startsWith("tt")) return null;

  const url = new URL(BASE);
  url.searchParams.set("apikey", key);
  url.searchParams.set("i", imdbId);
  url.searchParams.set("tomatoes", "true");

  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 60 * 60 * 24 } });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json()) as RawOmdb;
  if (data.Response !== "True") return null;

  let rt: number | null = null;
  for (const r of data.Ratings ?? []) {
    if (/Rotten Tomatoes/i.test(r.Source)) {
      rt = parsePercent(r.Value);
      break;
    }
  }

  const imdb = parseRatio(data.imdbRating);
  const meta = parsePercent(data.Metascore);

  return {
    imdbRating: imdb,
    imdbVotes: parseImdbVotes(data.imdbVotes),
    rottenTomatoes: rt,
    metacritic: meta,
    rated: data.Rated && data.Rated !== "N/A" ? data.Rated : null,
    awards: data.Awards && data.Awards !== "N/A" ? data.Awards : null,
    source: "omdb",
  };
}
