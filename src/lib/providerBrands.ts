// Provider-specific brand colors and text-on-color hints. Used to render
// colored tiles in "Where to watch" and chip selectors. Falls back to a
// neutral tile for unknown providers.

import { PROVIDER_BY_TMDB_ID, type ProviderDef } from "./providers";

export interface BrandSwatch {
  bg: string; // hex
  fg: "light" | "dark";
  glow?: string;
}

// Mostly derived from each service's primary brand color.
export const BRAND_BY_KEY: Record<string, BrandSwatch> = {
  netflix:        { bg: "#E50914", fg: "light", glow: "#E50914" },
  hulu:           { bg: "#1CE783", fg: "dark",  glow: "#1CE783" },
  max:            { bg: "#A148FF", fg: "light", glow: "#A148FF" },
  disney_plus:    { bg: "#0B2D8A", fg: "light", glow: "#1257E2" },
  apple_tv_plus:  { bg: "#0A0A0A", fg: "light", glow: "#FFFFFF" },
  prime_video:    { bg: "#1399FF", fg: "light", glow: "#1399FF" },
  paramount_plus: { bg: "#0064FF", fg: "light", glow: "#0064FF" },
  peacock:        { bg: "#E0007B", fg: "light", glow: "#FFC72C" },
  apple_tv:       { bg: "#1F1F23", fg: "light" },
  amazon_video:   { bg: "#FF9900", fg: "dark" },
  google_play:    { bg: "#34A853", fg: "light" },
  youtube:        { bg: "#FF0000", fg: "light" },
  vudu:           { bg: "#3B96D2", fg: "light" },
  microsoft_store:{ bg: "#0078D4", fg: "light" },
};

export const NEUTRAL_BRAND: BrandSwatch = { bg: "#2A2D38", fg: "light" };

export function getBrandSwatch(key: string): BrandSwatch {
  return BRAND_BY_KEY[key] ?? NEUTRAL_BRAND;
}

export function getProviderDefByTmdbId(id: number): ProviderDef | undefined {
  return PROVIDER_BY_TMDB_ID[id];
}
