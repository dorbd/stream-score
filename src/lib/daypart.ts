// Daypart classification + genre/runtime biases. TMDb genre IDs.
// Synthesized from the DSCI behavior model.

export type DaypartKey =
  | "sun_morning"
  | "weekend_matinee"
  | "lazy_sunday_pm"
  | "friday_blockbuster"
  | "saturday_primetime"
  | "weeknight_wind_down"
  | "late_night"
  | "insomnia_hours";

export interface DaypartBias {
  /** TMDb genre id → multiplier (>1 boost, <1 suppress, 0 hard suppress). */
  genreBoost: Record<number, number>;
  runtimePreference: { min?: number; max?: number; softMax?: number };
  ratingFloorBump: number;
  /** Short human-readable label used in "reasons" phrases. */
  label: string;
}

const G = {
  Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80,
  Doc: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36,
  Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749, SciFi: 878,
  Thriller: 53, War: 10752, Western: 37,
};

export const DAYPART_BIAS: Record<DaypartKey, DaypartBias> = {
  sun_morning: {
    label: "Sunday morning",
    genreBoost: { [G.Family]: 1.6, [G.Animation]: 1.5, [G.Adventure]: 1.3, [G.Comedy]: 1.2, [G.Horror]: 0, [G.Thriller]: 0.3, [G.Crime]: 0.4, [G.War]: 0.2 },
    runtimePreference: { max: 130 },
    ratingFloorBump: 0.3,
  },
  weekend_matinee: {
    label: "weekend matinee",
    genreBoost: { [G.Adventure]: 1.4, [G.Action]: 1.3, [G.Fantasy]: 1.3, [G.SciFi]: 1.2, [G.Comedy]: 1.2, [G.Drama]: 0.8, [G.Doc]: 0.5 },
    runtimePreference: { min: 90, max: 145, softMax: 125 },
    ratingFloorBump: 0,
  },
  lazy_sunday_pm: {
    label: "lazy Sunday afternoon",
    genreBoost: { [G.Drama]: 1.4, [G.History]: 1.3, [G.Crime]: 1.2, [G.Mystery]: 1.2, [G.Romance]: 1.1, [G.Horror]: 0.6 },
    runtimePreference: { min: 100 },
    ratingFloorBump: 0.4,
  },
  friday_blockbuster: {
    label: "Friday night",
    genreBoost: { [G.Action]: 1.5, [G.SciFi]: 1.4, [G.Thriller]: 1.3, [G.Adventure]: 1.3, [G.Fantasy]: 1.2, [G.Doc]: 0.4, [G.History]: 0.7 },
    runtimePreference: { min: 100, max: 160 },
    ratingFloorBump: -0.2,
  },
  saturday_primetime: {
    label: "Saturday prime time",
    genreBoost: { [G.Action]: 1.3, [G.Romance]: 1.3, [G.Comedy]: 1.2, [G.SciFi]: 1.2, [G.Fantasy]: 1.2, [G.Doc]: 0.5 },
    runtimePreference: { min: 100, max: 150 },
    ratingFloorBump: 0,
  },
  weeknight_wind_down: {
    label: "weeknight",
    genreBoost: { [G.Comedy]: 1.4, [G.Thriller]: 1.2, [G.Mystery]: 1.2, [G.Action]: 1.1, [G.Drama]: 0.7, [G.War]: 0.5, [G.History]: 0.6 },
    runtimePreference: { max: 110, softMax: 100 },
    ratingFloorBump: 0,
  },
  late_night: {
    label: "late night",
    genreBoost: { [G.Horror]: 1.5, [G.Thriller]: 1.4, [G.Crime]: 1.4, [G.SciFi]: 1.2, [G.Mystery]: 1.2, [G.Family]: 0, [G.Animation]: 0.4, [G.Drama]: 0.7 },
    runtimePreference: { max: 110, softMax: 100 },
    ratingFloorBump: -0.1,
  },
  insomnia_hours: {
    label: "the small hours",
    genreBoost: { [G.Mystery]: 1.4, [G.Thriller]: 1.3, [G.Crime]: 1.2, [G.Drama]: 0.6, [G.War]: 0.3, [G.History]: 0.4 },
    runtimePreference: { max: 105, softMax: 95 },
    ratingFloorBump: 0,
  },
};

/** Classify {hour, dayOfWeek} into a daypart key. dayOfWeek: 0=Sun..6=Sat. */
export function classifyDaypart(hour: number, dayOfWeek: number): DaypartKey {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  if (hour >= 2 && hour < 6) return "insomnia_hours";
  if (hour >= 23 || hour < 2) return "late_night";
  if (dayOfWeek === 0 && hour >= 6 && hour < 12) return "sun_morning";
  if (dayOfWeek === 0 && hour >= 14 && hour < 20) return "lazy_sunday_pm";
  if (isWeekend && hour >= 12 && hour < 17) return "weekend_matinee";
  if (dayOfWeek === 5 && hour >= 19 && hour < 23) return "friday_blockbuster";
  if (dayOfWeek === 6 && hour >= 19 && hour < 23) return "saturday_primetime";
  return "weeknight_wind_down";
}

/**
 * Compute a [-1, 1] fit score for a movie's genres against the active daypart bias.
 * Returns 0 when no genres match the bias table.
 */
export function daypartFitScore(genreIds: number[], dp: DaypartKey, runtime: number | null): number {
  const bias = DAYPART_BIAS[dp];
  let fit = 0;
  let n = 0;
  for (const id of genreIds) {
    const m = bias.genreBoost[id];
    if (m == null) continue;
    // Multipliers 0..2; remap to roughly -1..+1: m=1 -> 0, m=1.5 -> +0.5, m=0 -> -1, m=0.5 -> -0.5
    fit += Math.max(-1, Math.min(1, (m - 1)));
    n++;
  }
  let avg = n > 0 ? fit / n : 0;

  // Runtime cap penalty: if movie exceeds softMax, dock; exceeds hard max, penalize hard.
  if (runtime != null) {
    const { max, softMax } = bias.runtimePreference;
    if (max != null && runtime > max) avg -= 0.5;
    else if (softMax != null && runtime > softMax) avg -= 0.2;
  }
  return Math.max(-1, Math.min(1, avg));
}
