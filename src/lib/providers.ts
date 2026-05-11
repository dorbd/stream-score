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
  /** Canonical TMDb logo path. Hardcoded from /watch/providers/movie. */
  logoPath: string;
}

const IMG = "https://image.tmdb.org/t/p/w92";
export function providerCatalogLogo(def: ProviderDef): string {
  return IMG + def.logoPath;
}

export const PROVIDERS: ProviderDef[] = [
  {
    key: "netflix",
    name: "Netflix",
    short: "Netflix",
    tmdbIds: [8, 1796],
    kinds: ["flatrate"],
    color: "bg-red-600",
    logoPath: "/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg",
  },
  {
    key: "hulu",
    name: "Hulu",
    short: "Hulu",
    tmdbIds: [15],
    kinds: ["flatrate", "ads"],
    color: "bg-emerald-500",
    logoPath: "/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg",
  },
  {
    key: "max",
    name: "Max",
    short: "Max",
    tmdbIds: [1899, 384],
    kinds: ["flatrate"],
    color: "bg-indigo-600",
    logoPath: "/jbe4gVSfRlbPTdESXhEKpornsfu.jpg",
  },
  {
    key: "disney_plus",
    name: "Disney+",
    short: "Disney+",
    tmdbIds: [337],
    kinds: ["flatrate"],
    color: "bg-blue-700",
    logoPath: "/97yvRBw1GzX7fXprcF80er19ot.jpg",
  },
  {
    key: "apple_tv_plus",
    name: "Apple TV+",
    short: "Apple TV+",
    tmdbIds: [350],
    kinds: ["flatrate"],
    color: "bg-zinc-900",
    logoPath: "/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg",
  },
  {
    key: "prime_video",
    name: "Amazon Prime Video",
    short: "Prime Video",
    tmdbIds: [9, 119],
    kinds: ["flatrate"],
    color: "bg-sky-600",
    logoPath: "/pvske1MyAoymrs5bguRfVqYiM9a.jpg",
  },
  {
    key: "paramount_plus",
    name: "Paramount+",
    short: "Paramount+",
    tmdbIds: [531, 1853],
    kinds: ["flatrate"],
    color: "bg-blue-500",
    logoPath: "/h5DcR0J2EESLitnhR8xLG1QymTE.jpg",
  },
  {
    key: "peacock",
    name: "Peacock",
    short: "Peacock",
    tmdbIds: [386, 387],
    kinds: ["flatrate", "ads"],
    color: "bg-fuchsia-600",
    logoPath: "/2aGrp1xw3qhwCYvNGAJZPdjfeeX.jpg",
  },
  {
    key: "apple_tv",
    name: "Apple TV",
    short: "Apple TV",
    tmdbIds: [2],
    kinds: ["rent", "buy"],
    color: "bg-zinc-700",
    logoPath: "/SPnB1qiCkYfirS2it3hZORwGVn.jpg",
  },
  {
    key: "amazon_video",
    name: "Amazon Video",
    short: "Amazon",
    tmdbIds: [10],
    kinds: ["rent", "buy"],
    color: "bg-amber-600",
    logoPath: "/qR6FKvnPBx2O37FDg8PNM7efwF3.jpg",
  },
  {
    key: "google_play",
    name: "Google Play",
    short: "Google Play",
    tmdbIds: [3],
    kinds: ["rent", "buy"],
    color: "bg-green-600",
    logoPath: "/8z7rC8uIDaTM91X0ZfkRf04ydj2.jpg",
  },
  {
    key: "youtube",
    name: "YouTube",
    short: "YouTube",
    tmdbIds: [192],
    kinds: ["rent", "buy"],
    color: "bg-rose-600",
    logoPath: "/pTnn5JwWr4p3pG8H6VrpiQo7Vs0.jpg",
  },
  {
    key: "vudu",
    name: "Fandango at Home",
    short: "Vudu",
    tmdbIds: [7],
    kinds: ["rent", "buy"],
    color: "bg-cyan-600",
    logoPath: "/19fkcOz0xeUgCVW8tO85uOYnYK9.jpg",
  },
  {
    key: "microsoft_store",
    name: "Microsoft Store",
    short: "MS Store",
    tmdbIds: [68],
    kinds: ["rent", "buy"],
    color: "bg-teal-600",
    logoPath: "/shq88b09gTBYC4hA7K7MUL8Q4zP.jpg",
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
