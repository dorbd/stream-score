// Server-side TMDb v3 client. Never import from client components.
import type {
  TmdbDiscoverParams,
  TmdbGenre,
  TmdbMovieDetail,
  TmdbMovieSummary,
  TmdbWatchProviders,
} from "./types";

const BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p";

function getKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    throw new Error(
      "TMDB_API_KEY is not set. Add it to .env.local — see .env.example.",
    );
  }
  return key;
}

interface FetchOpts {
  query?: Record<string, string | number | undefined | null>;
  revalidate?: number;
}

async function tmdbFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const url = new URL(BASE + path);
  url.searchParams.set("api_key", getKey());
  url.searchParams.set("language", "en-US");
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    next: { revalidate: opts.revalidate ?? 60 * 60 * 6 },
  });
  if (!res.ok) {
    let msg = `TMDb ${res.status}`;
    try {
      const body = await res.json();
      if (body?.status_message) msg += `: ${body.status_message}`;
    } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export function posterUrl(path: string | null, size = "w500"): string | null {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

export function backdropUrl(path: string | null, size = "w1280"): string | null {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

export function providerLogoUrl(
  path: string | null,
  size = "w92",
): string | null {
  return path ? `${IMG_BASE}/${size}${path}` : null;
}

interface RawDiscoverResp {
  page: number;
  total_pages: number;
  total_results: number;
  results: RawMovie[];
}

interface RawMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids: number[];
  original_language: string;
}

function mapMovie(m: RawMovie): TmdbMovieSummary {
  const releaseDate = m.release_date || null;
  const year = releaseDate ? Number(releaseDate.slice(0, 4)) || null : null;
  return {
    id: m.id,
    title: m.title,
    originalTitle: m.original_title,
    overview: m.overview ?? "",
    posterPath: m.poster_path ?? null,
    backdropPath: m.backdrop_path ?? null,
    releaseDate,
    year,
    voteAverage: m.vote_average ?? 0,
    voteCount: m.vote_count ?? 0,
    popularity: m.popularity ?? 0,
    genreIds: m.genre_ids ?? [],
    originalLanguage: m.original_language ?? "en",
  };
}

export async function discoverMovies(params: TmdbDiscoverParams): Promise<{
  results: TmdbMovieSummary[];
  page: number;
  totalPages: number;
  totalResults: number;
}> {
  // If a free-text query is set, fall back to search/movie (TMDb's discover doesn't accept queries).
  if (params.query?.trim()) {
    const data = await tmdbFetch<RawDiscoverResp>("/search/movie", {
      query: {
        query: params.query.trim(),
        page: params.page ?? 1,
        include_adult: "false",
        region: params.watchRegion ?? "US",
        primary_release_year:
          params.yearGte && params.yearGte === params.yearLte
            ? params.yearGte
            : undefined,
      },
    });
    return {
      results: data.results.map(mapMovie),
      page: data.page,
      totalPages: data.total_pages,
      totalResults: data.total_results,
    };
  }

  const query: Record<string, string | number | undefined> = {
    page: params.page ?? 1,
    sort_by: params.sortBy ?? "popularity.desc",
    include_adult: "false",
    include_video: "false",
    with_genres: params.genreIds?.length ? params.genreIds.join(",") : undefined,
    "primary_release_date.gte": params.yearGte
      ? `${params.yearGte}-01-01`
      : undefined,
    "primary_release_date.lte": params.yearLte
      ? `${params.yearLte}-12-31`
      : undefined,
    "with_runtime.gte": params.runtimeGte,
    "with_runtime.lte": params.runtimeLte,
    "vote_average.gte": params.voteAverageGte,
    "vote_count.gte": params.voteCountGte ?? 50,
    with_original_language: params.originalLanguage,
    watch_region: params.watchProviderIds?.length
      ? params.watchRegion ?? "US"
      : undefined,
    with_watch_providers: params.watchProviderIds?.length
      ? params.watchProviderIds.join("|")
      : undefined,
    with_watch_monetization_types: params.watchProviderIds?.length
      ? "flatrate|free|ads"
      : undefined,
  };

  const data = await tmdbFetch<RawDiscoverResp>("/discover/movie", { query });
  return {
    results: data.results.map(mapMovie),
    page: data.page,
    totalPages: data.total_pages,
    totalResults: data.total_results,
  };
}

interface RawProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

interface RawProviders {
  link?: string;
  flatrate?: RawProvider[];
  rent?: RawProvider[];
  buy?: RawProvider[];
  ads?: RawProvider[];
  free?: RawProvider[];
}

interface RawMovieDetail extends RawMovie {
  runtime: number | null;
  genres: TmdbGenre[];
  imdb_id: string | null;
  homepage: string | null;
  status: string | null;
  tagline: string | null;
  production_countries: { iso_3166_1: string; name: string }[];
  spoken_languages: { iso_639_1: string; english_name: string }[];
  credits?: {
    cast: { id: number; name: string; character: string; order: number }[];
    crew: { id: number; name: string; job: string; department: string }[];
  };
  "watch/providers"?: { results: Record<string, RawProviders> };
}

function mapProviders(r: RawProviders | undefined): TmdbWatchProviders {
  const empty = { link: null, flatrate: [], rent: [], buy: [], ads: [], free: [] };
  if (!r) return empty;
  const m = (xs?: RawProvider[]) =>
    (xs ?? []).map((p) => ({
      providerId: p.provider_id,
      providerName: p.provider_name,
      logoPath: p.logo_path ?? null,
    }));
  return {
    link: r.link ?? null,
    flatrate: m(r.flatrate),
    rent: m(r.rent),
    buy: m(r.buy),
    ads: m(r.ads),
    free: m(r.free),
  };
}

export async function getMovieDetail(id: number): Promise<TmdbMovieDetail> {
  const raw = await tmdbFetch<RawMovieDetail>(`/movie/${id}`, {
    query: { append_to_response: "credits,watch/providers" },
  });
  const summary = mapMovie(raw);
  const director =
    raw.credits?.crew.find((c) => c.job === "Director")?.name ?? null;
  const cast = (raw.credits?.cast ?? [])
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      order: c.order,
    }));
  const wp = raw["watch/providers"]?.results ?? {};
  const watchProviders: Record<string, TmdbWatchProviders> = {};
  for (const [region, providers] of Object.entries(wp)) {
    watchProviders[region] = mapProviders(providers);
  }
  return {
    ...summary,
    runtime: raw.runtime ?? null,
    genres: raw.genres ?? [],
    imdbId: raw.imdb_id ?? null,
    homepage: raw.homepage ?? null,
    status: raw.status ?? null,
    tagline: raw.tagline ?? null,
    productionCountries: raw.production_countries ?? [],
    spokenLanguages: raw.spoken_languages ?? [],
    cast,
    director,
    watchProviders,
  };
}

export async function getMovieWatchProviders(
  id: number,
): Promise<Record<string, TmdbWatchProviders>> {
  const data = await tmdbFetch<{ results: Record<string, RawProviders> }>(
    `/movie/${id}/watch/providers`,
  );
  const out: Record<string, TmdbWatchProviders> = {};
  for (const [region, providers] of Object.entries(data.results)) {
    out[region] = mapProviders(providers);
  }
  return out;
}

export async function getMovieGenres(): Promise<TmdbGenre[]> {
  const data = await tmdbFetch<{ genres: TmdbGenre[] }>("/genre/movie/list");
  return data.genres;
}
