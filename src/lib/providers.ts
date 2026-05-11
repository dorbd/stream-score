// Canonical streaming provider catalog used across the app.
// `tmdbIds` are TMDb watch_provider IDs. Multiple IDs are listed when TMDb
// has separate entries (e.g. base vs. ad-supported, vs. add-on, vs. legacy).
// `kinds` indicates which offering categories apply for the provider.

export type ProviderKind = "flatrate" | "rent" | "buy" | "ads" | "free";

export interface ProviderDef {
  key: string;
  name: string;
  short: string;
  tmdbIds: number[];
  kinds: ProviderKind[];
  color: string; // tailwind-friendly bg color class
}

export const PROVIDERS: ProviderDef[] = [
  {
    key: "netflix",
    name: "Netflix",
    short: "Netflix",
    tmdbIds: [8, 1796], // 8 = Netflix, 1796 = Netflix Standard with Ads
    kinds: ["flatrate"],
    color: "bg-red-600",
  },
  {
    key: "hulu",
    name: "Hulu",
    short: "Hulu",
    tmdbIds: [15],
    kinds: ["flatrate", "ads"],
    color: "bg-emerald-500",
  },
  {
    key: "max",
    name: "Max",
    short: "Max",
    tmdbIds: [1899, 384], // 1899 = Max, 384 = HBO Max (legacy)
    kinds: ["flatrate"],
    color: "bg-indigo-600",
  },
  {
    key: "disney_plus",
    name: "Disney+",
    short: "Disney+",
    tmdbIds: [337],
    kinds: ["flatrate"],
    color: "bg-blue-700",
  },
  {
    key: "apple_tv_plus",
    name: "Apple TV+",
    short: "Apple TV+",
    tmdbIds: [350],
    kinds: ["flatrate"],
    color: "bg-zinc-900",
  },
  {
    key: "prime_video",
    name: "Amazon Prime Video",
    short: "Prime Video",
    tmdbIds: [9, 119], // 119 = Amazon Prime Video (legacy)
    kinds: ["flatrate"],
    color: "bg-sky-600",
  },
  {
    key: "paramount_plus",
    name: "Paramount+",
    short: "Paramount+",
    tmdbIds: [531, 1853], // 1853 = Paramount+ with Showtime
    kinds: ["flatrate"],
    color: "bg-blue-500",
  },
  {
    key: "peacock",
    name: "Peacock",
    short: "Peacock",
    tmdbIds: [386, 387], // 386 = Peacock, 387 = Peacock Premium
    kinds: ["flatrate", "ads"],
    color: "bg-fuchsia-600",
  },
  {
    key: "apple_tv",
    name: "Apple TV (rent/buy)",
    short: "Apple TV",
    tmdbIds: [2],
    kinds: ["rent", "buy"],
    color: "bg-zinc-700",
  },
  {
    key: "amazon_video",
    name: "Amazon Video (rent/buy)",
    short: "Amazon",
    tmdbIds: [10],
    kinds: ["rent", "buy"],
    color: "bg-amber-600",
  },
  {
    key: "google_play",
    name: "Google Play Movies",
    short: "Google Play",
    tmdbIds: [3],
    kinds: ["rent", "buy"],
    color: "bg-green-600",
  },
  {
    key: "youtube",
    name: "YouTube (rent/buy)",
    short: "YouTube",
    tmdbIds: [192],
    kinds: ["rent", "buy"],
    color: "bg-rose-600",
  },
  {
    key: "vudu",
    name: "Fandango at Home (Vudu)",
    short: "Vudu",
    tmdbIds: [7],
    kinds: ["rent", "buy"],
    color: "bg-cyan-600",
  },
  {
    key: "microsoft_store",
    name: "Microsoft Store",
    short: "MS Store",
    tmdbIds: [68],
    kinds: ["rent", "buy"],
    color: "bg-teal-600",
  },
];

export const PROVIDER_BY_KEY: Record<string, ProviderDef> = Object.fromEntries(
  PROVIDERS.map((p) => [p.key, p]),
);

export const PROVIDER_BY_TMDB_ID: Record<number, ProviderDef> = (() => {
  const map: Record<number, ProviderDef> = {};
  for (const p of PROVIDERS) for (const id of p.tmdbIds) map[id] = p;
  return map;
})();

export function selectedKeysToTmdbIds(keys: string[]): number[] {
  const out = new Set<number>();
  for (const k of keys) {
    const def = PROVIDER_BY_KEY[k];
    if (!def) continue;
    for (const id of def.tmdbIds) out.add(id);
  }
  return Array.from(out);
}
