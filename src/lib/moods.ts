// Curated mood/vibe presets that map to TMDb discover params.
// These are how humans pick a movie at 8pm on a Tuesday — genre IDs are not.

import type { TmdbDiscoverParams } from "./types";

// TMDb genre IDs:
// 28 Action, 12 Adventure, 16 Animation, 35 Comedy, 80 Crime, 99 Documentary,
// 18 Drama, 10751 Family, 14 Fantasy, 36 History, 27 Horror, 10402 Music,
// 9648 Mystery, 10749 Romance, 878 Sci-Fi, 53 Thriller, 10752 War, 37 Western.

export interface MoodPreset {
  key: string;
  label: string;
  emoji: string;
  genres: number[];
  excludeGenres?: number[];
  minRating?: number; // TMDb vote_average floor 0..10
  description: string;
}

export const MOODS: MoodPreset[] = [
  {
    key: "cozy",
    label: "Cozy night in",
    emoji: "🫖",
    genres: [10749, 35, 10751],
    excludeGenres: [27, 53],
    minRating: 6.5,
    description: "Warm, low-stakes comfort movies.",
  },
  {
    key: "edge",
    label: "Edge-of-seat",
    emoji: "⚡",
    genres: [53, 80, 28],
    minRating: 7,
    description: "Thrillers, taut crime, propulsive action.",
  },
  {
    key: "mindbender",
    label: "Mind-bender",
    emoji: "🌀",
    genres: [878, 9648, 53],
    minRating: 7,
    description: "Films you'll be thinking about at 2am.",
  },
  {
    key: "feelgood",
    label: "Feel-good",
    emoji: "🌞",
    genres: [35, 10751, 10749],
    excludeGenres: [27, 53, 10752],
    minRating: 6.5,
    description: "Sweet, funny, life-affirming.",
  },
  {
    key: "date",
    label: "Date night",
    emoji: "💛",
    genres: [10749, 35],
    minRating: 6.8,
    description: "Romance and rom-coms that work for two.",
  },
  {
    key: "laugh",
    label: "Just make me laugh",
    emoji: "😂",
    genres: [35],
    minRating: 6.5,
    description: "Pure comedy, no homework required.",
  },
  {
    key: "tearjerker",
    label: "Tearjerker",
    emoji: "🥲",
    genres: [18, 10749],
    minRating: 7,
    description: "Dramas that earn the tears.",
  },
  {
    key: "modern_classic",
    label: "Modern classic",
    emoji: "🏆",
    genres: [],
    minRating: 8,
    description: "Heavy hitters from the last 25 years.",
  },
];

export const MOOD_BY_KEY: Record<string, MoodPreset> = Object.fromEntries(
  MOODS.map((m) => [m.key, m]),
);

export function applyMoodToFilters(
  base: TmdbDiscoverParams,
  moodKey: string | null,
): TmdbDiscoverParams {
  if (!moodKey) return base;
  const m = MOOD_BY_KEY[moodKey];
  if (!m) return base;
  const next: TmdbDiscoverParams = { ...base };
  next.genreIds = m.genres.length ? m.genres : next.genreIds;
  if (m.minRating != null) next.voteAverageGte = Math.max(next.voteAverageGte ?? 0, m.minRating);
  return next;
}

export const TIME_BUDGETS: { key: string; label: string; min?: number; max?: number }[] = [
  { key: "short", label: "Quick (≤ 90 min)", max: 90 },
  { key: "standard", label: "Standard (~2 hr)", min: 91, max: 135 },
  { key: "long", label: "Long haul (> 2 hr)", min: 136 },
  { key: "any", label: "Any length" },
];
