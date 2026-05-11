// Ambient context from free APIs: Open-Meteo weather + hardcoded soft holidays.
// Server-only. Cached aggressively.

export type OutdoorVibe =
  | "rainy-cold" | "snowy" | "stormy" | "hot-clear" | "mild-clear" | "overcast" | "foggy" | "unknown";

/**
 * Coarse weather bucket used for the global Daily Bucket cache key.
 * Collapses the more granular OutdoorVibe into 4 buckets so that small wx
 * fluctuations don't blow the cache.
 */
export type WeatherBucket = "cozy" | "bright" | "neutral" | "unknown";

export function classifyWeatherBucket(vibe: OutdoorVibe): WeatherBucket {
  switch (vibe) {
    case "rainy-cold":
    case "snowy":
    case "stormy":
    case "foggy":
      return "cozy";
    case "hot-clear":
    case "mild-clear":
      return "bright";
    case "overcast":
      return "neutral";
    default:
      return "unknown";
  }
}

export type HolidayTag =
  | "halloween" | "valentines" | "pride" | "christmas" | "new-year"
  | "thanksgiving" | "independence-day" | "mothers-day" | "fathers-day" | null;

export interface AmbientContext {
  outdoorVibe: OutdoorVibe;
  isDark: boolean;
  warmth: number; // 0..1
  holiday: HolidayTag;
  /** Where this context applies (rounded to 0.1° for cache hit rate). */
  approxLocation: string;
}

interface OpenMeteoResp {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    cloud_cover?: number;
    is_day?: number;
  };
}

function vibeFromCode(code: number | undefined, temp: number | undefined, cloud: number | undefined): OutdoorVibe {
  if (code == null) return "unknown";
  if (code >= 95) return "stormy";
  if (code >= 71 && code <= 77) return "snowy";
  if (code >= 51 && code <= 67 && (temp ?? 99) < 12) return "rainy-cold";
  if (code >= 51 && code <= 67) return "rainy-cold"; // rainy regardless of temp
  if (code >= 45 && code <= 48) return "foggy";
  if ((cloud ?? 0) > 70) return "overcast";
  if ((temp ?? 0) > 27) return "hot-clear";
  return "mild-clear";
}

function softHolidayFor(date: Date): HolidayTag {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (m === 10 && d >= 25) return "halloween";
  if (m === 12 && d >= 18 && d <= 26) return "christmas";
  if ((m === 12 && d >= 30) || (m === 1 && d === 1)) return "new-year";
  if (m === 2 && d >= 12 && d <= 14) return "valentines";
  if (m === 7 && d >= 3 && d <= 4) return "independence-day";
  if (m === 6) return "pride";
  // Mother's Day = 2nd Sunday of May; Father's Day = 3rd Sunday of June
  if (m === 5 && date.getDay() === 0 && d >= 8 && d <= 14) return "mothers-day";
  if (m === 6 && date.getDay() === 0 && d >= 15 && d <= 21) return "fathers-day";
  if (m === 11 && date.getDay() === 4 && d >= 22 && d <= 28) return "thanksgiving";
  return null;
}

export async function getAmbientContext({
  lat,
  lng,
}: {
  lat: number | null;
  lng: number | null;
}): Promise<AmbientContext> {
  const holiday = softHolidayFor(new Date());
  if (lat == null || lng == null) {
    return { outdoorVibe: "unknown", isDark: false, warmth: 0.5, holiday, approxLocation: "unknown" };
  }
  // Round to 0.1° to maximize CDN/Next cache hits.
  const rLat = Math.round(lat * 10) / 10;
  const rLng = Math.round(lng * 10) / 10;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${rLat}&longitude=${rLng}&current=temperature_2m,weather_code,cloud_cover,is_day&timezone=auto`;
  let data: OpenMeteoResp | null = null;
  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (res.ok) data = (await res.json()) as OpenMeteoResp;
  } catch {
    /* ignore */
  }
  const c = data?.current;
  const outdoorVibe = vibeFromCode(c?.weather_code, c?.temperature_2m, c?.cloud_cover);
  const isDark = c?.is_day === 0;
  const warmth = c?.temperature_2m == null ? 0.5 : Math.max(0, Math.min(1, (c.temperature_2m + 5) / 40));
  return {
    outdoorVibe,
    isDark,
    warmth,
    holiday,
    approxLocation: `${rLat},${rLng}`,
  };
}

/** [-1, 1] fit score: does the movie's genres match the current ambient vibe? */
export function weatherFitScore(genreIds: number[], ambient: AmbientContext): number {
  const g = new Set(genreIds);
  const v = ambient.outdoorVibe;
  let fit = 0;

  // Genre IDs reused locally to avoid an import cycle.
  const Mystery = 9648, Thriller = 53, Crime = 80, Horror = 27, Romance = 10749,
    Drama = 18, Adventure = 12, Action = 28, Family = 10751, Animation = 16,
    SciFi = 878, Doc = 99;

  if (v === "rainy-cold") {
    if (g.has(Mystery)) fit += 0.6;
    if (g.has(Thriller)) fit += 0.5;
    if (g.has(Crime)) fit += 0.4;
    if (g.has(Drama)) fit += 0.3;
    if (g.has(Romance)) fit += 0.2;
    if (g.has(Action) && !g.has(Drama)) fit -= 0.2;
  } else if (v === "stormy") {
    if (g.has(Horror)) fit += 0.6;
    if (g.has(Thriller)) fit += 0.4;
  } else if (v === "snowy") {
    if (ambient.holiday === "christmas") {
      if (g.has(Family) || g.has(Romance)) fit += 0.5;
    }
    if (g.has(Adventure)) fit += 0.2;
  } else if (v === "foggy") {
    if (g.has(Mystery)) fit += 0.7;
    if (g.has(Horror)) fit += 0.4;
  } else if (v === "hot-clear") {
    if (g.has(Adventure)) fit += 0.4;
    if (g.has(Action)) fit += 0.3;
    if (g.has(SciFi)) fit += 0.2;
    if (g.has(Drama) && !g.has(Action)) fit -= 0.1;
  } else if (v === "mild-clear") {
    if (g.has(Romance) || g.has(Adventure)) fit += 0.2;
  }

  // Holiday overrides (strong)
  if (ambient.holiday === "halloween") {
    if (g.has(Horror)) fit += 0.8;
    if (g.has(Thriller)) fit += 0.4;
  }
  if (ambient.holiday === "christmas") {
    if (g.has(Family) || g.has(Romance)) fit += 0.7;
  }
  if (ambient.holiday === "valentines") {
    if (g.has(Romance)) fit += 0.8;
    if (g.has(Doc) || g.has(Horror)) fit -= 0.3;
  }
  if (ambient.holiday === "thanksgiving" && (g.has(Family) || g.has(Drama))) fit += 0.4;

  // Dark outside slightly favors moody genres regardless of vibe
  if (ambient.isDark && (g.has(Thriller) || g.has(Crime) || g.has(Mystery))) fit += 0.05;
  if (!ambient.isDark && (g.has(Family) || g.has(Animation))) fit += 0.05;

  return Math.max(-1, Math.min(1, fit));
}
