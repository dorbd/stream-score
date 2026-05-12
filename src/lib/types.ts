// Shared types used by API clients, route handlers, and UI.

export type Iso3166 = string; // e.g. "US"

export interface TmdbConfigImages {
  secureBaseUrl: string;
  posterSizes: string[];
  backdropSizes: string[];
  profileSizes: string[];
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbDiscoverParams {
  page?: number;
  sortBy?: string;
  genreIds?: number[];
  yearGte?: number;
  yearLte?: number;
  runtimeGte?: number;
  runtimeLte?: number;
  voteAverageGte?: number;
  voteCountGte?: number;
  originalLanguage?: string;
  watchRegion?: string;
  watchProviderIds?: number[];
  query?: string; // when set, /search/movie is used instead of /discover/movie
}

export interface TmdbMovieSummary {
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  year: number | null;
  voteAverage: number; // 0..10
  voteCount: number;
  popularity: number;
  genreIds: number[];
  originalLanguage: string;
}

export interface TmdbProviderEntry {
  providerId: number;
  providerName: string;
  logoPath: string | null;
}

export interface TmdbWatchProviders {
  link: string | null;
  flatrate: TmdbProviderEntry[];
  rent: TmdbProviderEntry[];
  buy: TmdbProviderEntry[];
  ads: TmdbProviderEntry[];
  free: TmdbProviderEntry[];
}

export interface TmdbMovieDetail extends TmdbMovieSummary {
  runtime: number | null;
  genres: TmdbGenre[];
  imdbId: string | null;
  homepage: string | null;
  status: string | null;
  tagline: string | null;
  productionCountries: { iso_3166_1: string; name: string }[];
  spokenLanguages: { iso_639_1: string; english_name: string }[];
  cast: { id: number; name: string; character: string; order: number }[];
  director: string | null;
  watchProviders: Record<string, TmdbWatchProviders>; // keyed by region code
}

export interface OmdbRatings {
  imdbRating: number | null; // 0..10
  imdbVotes: number | null;
  rottenTomatoes: number | null; // 0..100
  metacritic: number | null; // 0..100
  rated: string | null; // e.g. PG-13
  awards: string | null;
  source: "omdb";
}

export interface AggregatedRatings {
  imdb: number | null; // normalized 0..100
  rottenTomatoes: number | null; // 0..100
  metacritic: number | null; // 0..100
  audience: number | null; // 0..100 (TMDb vote_average * 10 as proxy)
  combined: number | null; // 0..100, weighted, rounded
  providerBoost: number; // 0..10 applied to combined
  available: ("imdb" | "rottenTomatoes" | "metacritic" | "audience")[];
}

export interface MovieResult {
  tmdbId: number;
  imdbId: string | null;
  title: string;
  year: number | null;
  overview: string;
  runtime: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
  originalLanguage: string;
  ratings: AggregatedRatings;
  availability: {
    flatrate: ProviderTag[];
    rent: ProviderTag[];
    buy: ProviderTag[];
    free: ProviderTag[];
    ads: ProviderTag[];
    link: string | null;
  };
  links: {
    tmdb: string;
    imdb: string | null;
    justwatch: string | null;
  };
  /** 7-dim taste-space vector in canonical axis order; clipped to [-1, +1]. */
  dnaProfile?: number[];
}

export interface ProviderTag {
  id: number;
  name: string;
  logoUrl: string | null;
  key: string; // canonical app-side key, e.g. "netflix"
}

export interface DiscoverResponse {
  results: MovieResult[];
  page: number;
  totalPages: number;
  totalResults: number;
}

export interface ApiError {
  error: string;
}
