// Compose a MovieResult from TMDb + OMDb data + user provider selection.

import { combineRatings } from "./ratingsAggregator";
import { mapProviderEntries } from "./providerMapper";
import { getOmdbByImdbId } from "./omdbClient";
import { backdropUrl, posterUrl } from "./tmdbClient";
import { computeMovieDnaProfile } from "./movies/dnaProfile";
import type {
  MovieResult,
  TmdbMovieDetail,
  TmdbMovieSummary,
  TmdbWatchProviders,
} from "./types";

const TMDB_BASE = "https://www.themoviedb.org/movie";
const IMDB_BASE = "https://www.imdb.com/title";
const JUSTWATCH = "https://www.justwatch.com";

interface BuildOptions {
  region: string;
  selectedProviderKeys: string[];
  imdbId?: string | null;
  runtime?: number | null;
  genres?: string[];
  watchProvidersByRegion?: Record<string, TmdbWatchProviders>;
}

const genreCache = new Map<number, string>();
export function primeGenreCache(genres: { id: number; name: string }[]): void {
  for (const g of genres) genreCache.set(g.id, g.name);
}

export function genreIdsToNames(ids: number[]): string[] {
  return ids
    .map((id) => genreCache.get(id))
    .filter((n): n is string => Boolean(n));
}

export async function buildMovieResult(
  movie: TmdbMovieSummary,
  opts: BuildOptions,
): Promise<MovieResult> {
  const imdbId = opts.imdbId ?? null;
  const omdb = imdbId ? await getOmdbByImdbId(imdbId) : null;

  const wp = opts.watchProvidersByRegion?.[opts.region];

  const ratings = combineRatings({
    tmdbVoteAverage: movie.voteAverage,
    tmdbVoteCount: movie.voteCount,
    omdb,
  });

  const availability = {
    flatrate: mapProviderEntries(wp?.flatrate ?? []),
    rent: mapProviderEntries(wp?.rent ?? []),
    buy: mapProviderEntries(wp?.buy ?? []),
    free: mapProviderEntries(wp?.free ?? []),
    ads: mapProviderEntries(wp?.ads ?? []),
    link: wp?.link ?? null,
  };

  // JustWatch slugs aren't deterministic; use their search URL instead.
  const regionLower = opts.region.toLowerCase();
  const justwatchUrl = `${JUSTWATCH}/${regionLower}/search?q=${encodeURIComponent(movie.title)}`;

  const dnaProfile = computeMovieDnaProfile({
    genreIds: movie.genreIds,
    runtime: opts.runtime ?? null,
    year: movie.year,
    originalLanguage: movie.originalLanguage,
  });

  return {
    tmdbId: movie.id,
    imdbId,
    title: movie.title,
    year: movie.year,
    overview: movie.overview,
    runtime: opts.runtime ?? null,
    posterUrl: posterUrl(movie.posterPath),
    backdropUrl: backdropUrl(movie.backdropPath),
    genres:
      opts.genres ??
      genreIdsToNames(movie.genreIds),
    originalLanguage: movie.originalLanguage,
    ratings,
    availability,
    links: {
      tmdb: `${TMDB_BASE}/${movie.id}`,
      imdb: imdbId ? `${IMDB_BASE}/${imdbId}/` : null,
      justwatch: justwatchUrl,
    },
    dnaProfile,
  };
}

export async function buildMovieResultFromDetail(
  detail: TmdbMovieDetail,
  opts: { region: string; selectedProviderKeys: string[] },
): Promise<MovieResult> {
  return buildMovieResult(detail, {
    region: opts.region,
    selectedProviderKeys: opts.selectedProviderKeys,
    imdbId: detail.imdbId,
    runtime: detail.runtime,
    genres: detail.genres.map((g) => g.name),
    watchProvidersByRegion: detail.watchProviders,
  });
}
