// Map TMDb watch_provider entries to our canonical ProviderTag shape.
// Unknown providers are still surfaced but with a generic key so they can be
// displayed without breaking the UI.

import { PROVIDER_BY_TMDB_ID } from "./providers";
import { providerLogoUrl } from "./tmdbClient";
import type { ProviderTag, TmdbProviderEntry } from "./types";

export function mapProviderEntries(
  entries: TmdbProviderEntry[],
): ProviderTag[] {
  return entries.map((e) => {
    const def = PROVIDER_BY_TMDB_ID[e.providerId];
    return {
      id: e.providerId,
      name: def?.name ?? e.providerName,
      logoUrl: providerLogoUrl(e.logoPath),
      key: def?.key ?? `tmdb_${e.providerId}`,
    };
  });
}

export function hasAnySelectedProvider(
  entries: TmdbProviderEntry[],
  selectedKeys: string[],
): boolean {
  if (!selectedKeys.length) return false;
  const selected = new Set(selectedKeys);
  for (const e of entries) {
    const def = PROVIDER_BY_TMDB_ID[e.providerId];
    if (def && selected.has(def.key)) return true;
  }
  return false;
}
