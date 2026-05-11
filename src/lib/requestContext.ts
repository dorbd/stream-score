import type { NextRequest } from "next/server";

export interface RequestContext {
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string;
  hourLocal: number;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sun
  isMobile: boolean;
  locale: string;
  lat: number | null;
  lng: number | null;
  /**
   * Stable bucket key built from country + timezone + locale. Useful as a
   * default partial key — the full Daily Bucket key composed in `bucket.ts`
   * extends this with services hash, hour bucket, weather bucket, weekday,
   * and holiday flag.
   */
  bucketKey: string;
  /**
   * Whether the user has granted consent for personalized features (anchor,
   * taste, local storage of preferences). For EU users we default to `false`
   * until the consent banner is accepted; everyone else defaults to `true`.
   */
  consentGranted: boolean;
}

// EU/EEA + UK ISO 3166-1 alpha-2 codes. Consent defaults to false in these.
const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
  "GB", "CH",
]);

export function isEuCountry(country: string | null): boolean {
  return !!country && EU_COUNTRIES.has(country.toUpperCase());
}

const pick = (h: Headers, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = h.get(k);
    if (v) return decodeURIComponent(v);
  }
  return null;
};

const parseLocale = (al: string | null): string => {
  if (!al) return "en-US";
  const top = al.split(",")[0]?.split(";")[0]?.trim();
  return top && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/i.test(top) ? top : "en-US";
};

const num = (v: string | null): number | null => {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function getRequestContext(req: NextRequest): RequestContext {
  const h = req.headers;
  const country = pick(h, "x-vercel-ip-country", "cf-ipcountry");
  const region = pick(h, "x-vercel-ip-country-region", "cf-region");
  const city = pick(h, "x-vercel-ip-city", "cf-ipcity");
  const timezone =
    pick(h, "x-vercel-ip-timezone", "cf-timezone") ||
    process.env.STREAMSCORE_FALLBACK_TZ ||
    "America/New_York";
  const lat = num(pick(h, "x-vercel-ip-latitude", "cf-iplatitude"));
  const lng = num(pick(h, "x-vercel-ip-longitude", "cf-iplongitude"));

  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const hourLocal = Number(fmt.find((p) => p.type === "hour")?.value ?? now.getUTCHours());
  const weekdayStr = fmt.find((p) => p.type === "weekday")?.value ?? "Sun";
  const dowIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayStr);
  const dayOfWeek = (dowIdx < 0 ? 0 : dowIdx) as RequestContext["dayOfWeek"];

  const chMobile = h.get("sec-ch-ua-mobile");
  const ua = h.get("user-agent") ?? "";
  const isMobile =
    chMobile === "?1" || (chMobile == null && /Mobi|Android|iPhone|iPad/i.test(ua));

  const locale = parseLocale(h.get("accept-language"));
  const countryUpper = (country ?? "").toUpperCase();
  const bucketKey = [countryUpper || "??", timezone, locale].join("|");

  // Consent: explicit cookie wins; otherwise default false in EU, true elsewhere.
  const consentCookie = req.cookies.get("ss_consent")?.value;
  const consentGranted =
    consentCookie === "granted"
      ? true
      : consentCookie === "denied"
        ? false
        : !isEuCountry(country);

  return {
    country,
    region,
    city,
    timezone,
    hourLocal,
    dayOfWeek,
    isMobile,
    locale,
    lat,
    lng,
    bucketKey,
    consentGranted,
  };
}
