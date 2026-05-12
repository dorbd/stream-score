"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Search, X, Share2, Heart } from "lucide-react";
import { toast } from "sonner";
import { MovieCard } from "@/components/MovieCard";
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  SORT_OPTIONS,
  type FilterValues,
} from "@/components/MovieFilters";
import { FilterDrawer } from "@/components/FilterDrawer";
import { OnboardingHero } from "@/components/OnboardingHero";
import { EmptyState } from "@/components/EmptyState";
import { LoadingGrid, LoadingInline } from "@/components/LoadingState";
import { useSelectedProviders } from "@/hooks/useSelectedProviders";
import { useWatchlist, useHidden } from "@/hooks/useLocalSet";
import { HeroCard } from "@/components/HeroCard";
import { AnchorPrompt } from "@/components/AnchorPrompt";
import { useAnchor } from "@/lib/anchor";
import { useStoredDna } from "@/lib/dna/storage";
import { buildRails } from "@/lib/dna/rails";
import { Rail } from "@/components/Rail";
import { DnaBanner } from "@/components/dna/DnaBanner";
import { PROVIDER_BY_KEY } from "@/lib/providers";
import { getBrandSwatch } from "@/lib/providerBrands";
import { MOODS } from "@/lib/moods";
import { cn } from "@/lib/cn";
import type { DiscoverResponse, MovieResult, TmdbGenre } from "@/lib/types";

interface TonightContext {
  daypart: string;
  daypartLabel: string;
  hourLocal: number;
  timezone: string;
  city: string | null;
  weather: string;
  isDark: boolean;
  holiday: string | null;
  wildRubric?: string | null;
  keywordHints?: string[];
}

type Tab = "discover" | "tonight" | "watchlist";

export function DiscoverClient({
  initialGenres,
  configError,
}: {
  initialGenres: TmdbGenre[];
  configError: string | null;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const urlParams = useSearchParams();
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS);
  const [moodKey, setMoodKey] = useState<string | null>(null);
  const [timeBudget, setTimeBudget] = useState<"any" | "short" | "standard" | "long">("any");
  /**
   * Year filter — can be:
   *   "any" → no year constraint
   *   "<YYYY>" → exact year (e.g. "2025")
   *   "2010s" / "2000s" / "1990s" / "1980s" / "classics" → decade buckets
   */
  const [yearBucket, setYearBucket] = useState<string>("any");
  const { anchor, hydrated: anchorHydrated } = useAnchor();
  const { dna, hydrated: dnaHydrated } = useStoredDna();
  const [anchorPromptOpen, setAnchorPromptOpen] = useState(false);
  const prevHiddenCountRef = useRef(0);
  const [results, setResults] = useState<MovieResult[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { selected, hydrated, toggle, setSelected } = useSelectedProviders();
  const watchlist = useWatchlist();
  const hidden = useHidden();
  const [tab, setTab] = useState<Tab>("discover");
  const [hasOnboarded, setHasOnboarded] = useState(false);

  // Inbound share link: /?with=netflix,hulu
  const withParam = urlParams?.get("with");
  const [showShareBanner, setShowShareBanner] = useState<string[] | null>(null);

  useEffect(() => {
    let canceled = false;
    Promise.resolve().then(() => {
      if (canceled) return;
      try {
        if (window.localStorage.getItem("stream-score:onboarded") === "1") {
          setHasOnboarded(true);
        }
      } catch {}
      if (withParam) {
        const incoming = withParam.split(",").map((s) => s.trim()).filter(Boolean);
        if (incoming.length) setShowShareBanner(incoming);
      }
    });
    return () => {
      canceled = true;
    };
  }, [withParam]);

  // Open the AnchorPrompt the FIRST time the user hides a movie (and no anchor set yet).
  useEffect(() => {
    if (!anchorHydrated) return;
    const cur = hidden.values.length;
    const prev = prevHiddenCountRef.current;
    prevHiddenCountRef.current = cur;
    if (cur > prev && !anchor) {
      let canceled = false;
      Promise.resolve().then(() => {
        if (!canceled) setAnchorPromptOpen(true);
      });
      return () => {
        canceled = true;
      };
    }
  }, [hidden.values.length, anchor, anchorHydrated]);

  const showOnboarding = hydrated && selected.length === 0 && !hasOnboarded;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReqRef = useRef(0);

  // Build filter object for the API.
  const buildParams = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      if (filters.query) params.set("q", filters.query);
      const moodGenres = moodKey ? (MOODS.find((m) => m.key === moodKey)?.genres ?? []) : [];
      const allGenres = moodGenres.length ? moodGenres : filters.genres;
      if (allGenres.length) params.set("genres", allGenres.join(","));
      // Year bucket overrides the slider when active.
      // Supports: "any" | exact year "2025" | decade "2010s" | "classics"
      let yMin = filters.yearMin;
      let yMax = filters.yearMax;
      if (yearBucket !== "any") {
        if (/^\d{4}$/.test(yearBucket)) {
          const y = Number(yearBucket);
          yMin = y;
          yMax = y;
        } else if (yearBucket === "2020s") {
          yMin = 2020;
          yMax = 2029;
        } else if (yearBucket === "2010s") {
          yMin = 2010;
          yMax = 2019;
        } else if (yearBucket === "2000s") {
          yMin = 2000;
          yMax = 2009;
        } else if (yearBucket === "1990s") {
          yMin = 1990;
          yMax = 1999;
        } else if (yearBucket === "1980s") {
          yMin = 1980;
          yMax = 1989;
        } else if (yearBucket === "classics") {
          yMin = 1920;
          yMax = 1979;
        }
      }
      if (yMin) params.set("year_min", String(yMin));
      if (yMax) params.set("year_max", String(yMax));
      const moodRating = moodKey ? (MOODS.find((m) => m.key === moodKey)?.minRating ?? 0) : 0;
      const ratingMin = Math.max(filters.ratingMin, moodRating);
      if (ratingMin > 0) params.set("rating_min", String(ratingMin));
      if (timeBudget === "short") params.set("runtime_max", "90");
      else if (timeBudget === "standard") {
        params.set("runtime_min", "91");
        params.set("runtime_max", "135");
      } else if (timeBudget === "long") params.set("runtime_min", "136");
      else if (filters.runtimeMax < 240) params.set("runtime_max", String(filters.runtimeMax));
      if (filters.language) params.set("lang", filters.language);
      params.set("sort", filters.sort);
      if (selected.length) params.set("providers", selected.join(","));
      if (filters.onlyMine && selected.length) params.set("only_mine", "true");
      if (hidden.values.length) params.set("hide", hidden.values.join(","));
      params.set("page", String(p));
      return params;
    },
    [filters, selected, hidden.values, moodKey, timeBudget, yearBucket],
  );

  const fetchResults = useCallback(
    async (opts: { page?: number; reset?: boolean }) => {
      if (!hydrated) return;
      const reqId = ++lastReqRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/discover?${buildParams(opts.page ?? 1).toString()}`);
        if (reqId !== lastReqRef.current) return;
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Request failed: ${res.status}`);
        }
        const data = (await res.json()) as DiscoverResponse;
        if (reqId !== lastReqRef.current) return;
        setTotalPages(data.totalPages);
        setPage(data.page);
        setResults((prev) =>
          opts.reset || (opts.page ?? 1) === 1 ? data.results : [...prev, ...data.results],
        );
      } catch (e) {
        if (reqId !== lastReqRef.current) return;
        setError(e instanceof Error ? e.message : "Failed to load results.");
      } finally {
        if (reqId === lastReqRef.current) setLoading(false);
      }
    },
    [hydrated, buildParams],
  );

  useEffect(() => {
    if (showOnboarding) return;
    if (tab === "watchlist") return;
    // When DNA is present, the Discover tab is rendered as <Rail> stack and
    // the grid is hidden — skip the discover fetch entirely on that path.
    if (tab === "discover" && dnaHydrated && dna) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults({ page: 1, reset: true });
    }, filters.query ? 280 : 60);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchResults, showOnboarding, tab, filters.query, dna, dnaHydrated]);

  const selectedDefs = useMemo(
    () => selected.map((k) => PROVIDER_BY_KEY[k]).filter(Boolean),
    [selected],
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Filter hidden client-side too (belt and suspenders).
  const visibleResults = useMemo(
    () => results.filter((m) => !hidden.values.includes(m.tmdbId)),
    [results, hidden.values],
  );

  // Watchlist tab: fetch each watchlist movie via /api/movie/[id]. For MVP, just show stored cards from the latest fetch if they overlap.
  const watchlistMovies = useMemo(
    () => visibleResults.filter((m) => watchlist.values.includes(m.tmdbId)),
    [visibleResults, watchlist.values],
  );

  const activeFilters =
    countActiveFilters(filters) +
    (moodKey ? 1 : 0) +
    (timeBudget !== "any" ? 1 : 0) +
    (yearBucket !== "any" ? 1 : 0);

  // For-You rails (Discover replacement) — only computed when DNA exists.
  // We memo on dna.archetype + provider list so a Retake or a new service
  // pick recomputes the rail set without re-running on every render.
  const rails = useMemo(() => {
    if (!dnaHydrated || !dna) return null;
    return buildRails(dna, selected);
  }, [dna, dnaHydrated, selected]);

  // Tonight tab — fetch atmosphere context (daypart, weather, "on this day").
  // The HeroCard itself fetches /api/daily-pick for the LLM-curated pick.
  const [tonightCtx, setTonightCtx] = useState<TonightContext | null>(null);

  useEffect(() => {
    if (tab !== "tonight") return;
    let canceled = false;
    fetch(`/api/tonight?providers=${selected.join(",")}`)
      .then((r) => r.json())
      .then((data) => {
        if (canceled || data?.error) return;
        if (data.context) setTonightCtx(data.context);
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [tab, selected]);

  const acceptShareIntersect = () => {
    if (!showShareBanner) return;
    const merged = Array.from(new Set([...selected, ...showShareBanner]));
    setSelected(merged);
    toast.success(`Merged ${showShareBanner.length} ${showShareBanner.length === 1 ? "service" : "services"}.`);
    setShowShareBanner(null);
    router.replace("/", { scroll: false });
  };

  const shareMyServices = async () => {
    if (selected.length === 0) {
      toast("Pick at least one service first.");
      return;
    }
    const url = `${window.location.origin}/?with=${selected.join(",")}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My streaming services on stream·score", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied — share with your couch partner.");
      }
    } catch {
      /* user canceled */
    }
  };

  if (showOnboarding) {
    return <OnboardingHero onDone={() => setHasOnboarded(true)} />;
  }

  return (
    <div className="space-y-6">
      {/* Inbound share banner */}
      {showShareBanner && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-4 text-sm"
        >
          <div>
            <div className="font-semibold text-[var(--color-text)]">
              Someone shared their services with you
            </div>
            <div className="text-[var(--color-muted)]">
              {showShareBanner.map((k) => PROVIDER_BY_KEY[k]?.short ?? k).join(", ")}.
              Add them to find movies you can both watch.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowShareBanner(null);
                router.replace("/", { scroll: false });
              }}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--color-muted)]"
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={acceptShareIntersect}
              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-zinc-900"
            >
              Merge services
            </button>
          </div>
        </motion.div>
      )}

      <section className="space-y-3">
        <h1 className="font-display text-5xl leading-[0.95] tracking-[-0.02em] sm:text-6xl">
          What can you{" "}
          <span className="italic text-[var(--color-accent)]">watch</span>{" "}
          tonight?
        </h1>
        <p className="text-sm text-[var(--color-muted)]">
          {hydrated && selectedDefs.length > 0 ? (
            <>
              Showing what&apos;s on{" "}
              <span className="font-medium text-[var(--color-text)]">
                {selectedDefs.map((d) => d.short).join(", ")}
              </span>
              .{" "}
              <button
                type="button"
                onClick={shareMyServices}
                className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              >
                <Share2 className="h-3 w-3" />
                Share with someone
              </button>
            </>
          ) : (
            <>
              <Link href="/settings" className="text-[var(--color-text)] underline-offset-4 hover:underline">
                Pick your services
              </Link>{" "}
              to filter by what you pay for.
            </>
          )}
        </p>
      </section>

      {configError && (
        <div className="rounded-2xl border border-[var(--color-warn)]/40 bg-[var(--color-accent-soft)] p-4 text-sm" role="alert">
          <div className="font-medium">Configuration issue</div>
          <div className="mt-1 text-[var(--color-muted)]">{configError}</div>
        </div>
      )}

      {/* My services strip */}
      {selected.length > 0 && (
        <div className="-mx-4 px-4 sm:-mx-6 sm:px-6">
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto py-1">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Your services
            </span>
            {selectedDefs.map((d) => {
              const brand = getBrandSwatch(d.key);
              const fgClass = brand.fg === "light" ? "text-white" : "text-zinc-900";
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggle(d.key)}
                  className={cn(
                    "group brand-tile inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold",
                    fgClass,
                  )}
                  style={{ background: brand.bg }}
                  aria-label={`Remove ${d.name}`}
                  title="Tap to remove"
                >
                  {d.short}
                  <X className="h-3 w-3 opacity-0 transition group-hover:opacity-80" />
                </button>
              );
            })}
            <Link
              href="/settings"
              className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-1.5 text-xs text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
            >
              + Manage
            </Link>
          </div>
        </div>
      )}

      {/* Tab strip */}
      <div role="tablist" aria-label="Views" className="inline-flex rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-1 text-sm">
        {([
          { key: "discover", label: "Discover" },
          { key: "tonight", label: "Tonight" },
          { key: "watchlist", label: `Watchlist${watchlist.values.length ? ` · ${watchlist.values.length}` : ""}` },
        ] as { key: Tab; label: string }[]).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 transition",
              tab === t.key
                ? "bg-[var(--color-accent)] text-zinc-900"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Mood chips (Discover + Tonight only).
          Hidden when rails are active — they don't read mood state. */}
      {tab !== "watchlist" && !(tab === "discover" && rails) && (
        <div className="-mx-4 px-4 sm:-mx-6 sm:px-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            What are you in the mood for?
          </div>
          <div className="no-scrollbar flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
            {MOODS.map((m) => {
              const on = moodKey === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMoodKey(on ? null : m.key)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    on
                      ? "border-transparent bg-[var(--color-accent)] text-zinc-900 shadow-sm"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]/40 text-[var(--color-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]",
                  )}
                  aria-pressed={on}
                  title={m.description}
                >
                  <span aria-hidden>{m.emoji}</span>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search + sort + filter + time + onlyMine.
          Hidden on Discover when rails are active — the rails are pre-curated
          and don't respond to these controls. */}
      {tab !== "watchlist" && !(tab === "discover" && rails) && (
        <div className="sticky top-[60px] z-20 -mx-4 border-y border-[var(--color-border)] bg-[var(--color-bg)]/85 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-subtle)]" aria-hidden />
              <input
                type="search"
                inputMode="search"
                placeholder="Search titles…"
                value={filters.query}
                onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 py-2 pl-9 pr-3 text-sm placeholder:text-[var(--color-subtle)] focus-visible:border-[var(--color-accent)]"
                aria-label="Search titles"
              />
            </div>
            {selected.length > 0 && (
              <div role="group" aria-label="Show all or only my services" className="hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-1 text-xs sm:flex">
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, onlyMine: true }))}
                  className={cn(
                    "rounded-lg px-2.5 py-1 transition",
                    filters.onlyMine ? "bg-[var(--color-accent)] text-zinc-900 font-semibold" : "text-[var(--color-muted)]",
                  )}
                >
                  On my services
                </button>
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, onlyMine: false }))}
                  className={cn(
                    "rounded-lg px-2.5 py-1 transition",
                    !filters.onlyMine ? "bg-[var(--color-accent)] text-zinc-900 font-semibold" : "text-[var(--color-muted)]",
                  )}
                >
                  Everything
                </button>
              </div>
            )}
            <select
              value={filters.sort}
              onChange={(e) =>
                setFilters((f) => ({ ...f, sort: e.target.value as FilterValues["sort"] }))
              }
              className="hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-3 py-2 text-sm sm:block"
              aria-label="Sort by"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <FilterDrawer
              value={filters}
              onChange={setFilters}
              genres={initialGenres}
              activeCount={activeFilters}
            />
          </div>

          {/* Time budget chips */}
          <div className="mt-2 flex items-center gap-1.5">
            <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)] sm:inline">
              Time
            </span>
            {(["any", "short", "standard", "long"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTimeBudget(k)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  timeBudget === k
                    ? "border-transparent bg-[var(--color-text)] text-[var(--color-bg)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)]",
                )}
                aria-pressed={timeBudget === k}
              >
                {k === "any" ? "Any length" : k === "short" ? "≤ 90 min" : k === "standard" ? "~2 hr" : "> 2 hr"}
              </button>
            ))}
          </div>

          {/* Year chips — Any, current down to 2020, then decade buckets */}
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)] sm:inline">
              Year
            </span>
            {(() => {
              const now = new Date().getFullYear();
              const recentYears: string[] = [];
              for (let y = now; y >= 2020; y--) recentYears.push(String(y));
              const buckets: { key: string; label: string }[] = [
                { key: "any", label: "Any year" },
                ...recentYears.map((y) => ({ key: y, label: y })),
                { key: "2010s", label: "2010s" },
                { key: "2000s", label: "2000s" },
                { key: "1990s", label: "1990s" },
                { key: "1980s", label: "1980s" },
                { key: "classics", label: "Classics" },
              ];
              return buckets.map((b) => {
                const on = yearBucket === b.key;
                const isSpecificYear = /^\d{4}$/.test(b.key);
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setYearBucket(b.key)}
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition tabular-nums",
                      on
                        ? "border-transparent bg-[var(--color-accent)] text-[var(--color-bg)]"
                        : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)]",
                      isSpecificYear && !on && "font-mono",
                    )}
                    aria-pressed={on}
                  >
                    {b.label}
                  </button>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Tonight tab: cinematic hero + alts ribbon */}
      {tab === "tonight" && !error && (
        <section className="space-y-6" aria-live="polite">
          {tonightCtx && <TonightContextBar ctx={tonightCtx} />}
          <HeroCard selectedProviderKeys={selected} />
        </section>
      )}

      {/* Watchlist tab */}
      {tab === "watchlist" && (
        <section className="space-y-3" aria-live="polite">
          {watchlist.values.length === 0 ? (
            <EmptyState
              title="Your watchlist is empty"
              description="Tap the heart on any movie to save it for later. Your watchlist lives in your browser."
              action={
                <button
                  type="button"
                  onClick={() => setTab("discover")}
                  className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-zinc-900"
                >
                  Find something
                </button>
              }
            />
          ) : watchlistMovies.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {watchlistMovies.map((m, i) => (
                <MovieCard key={m.tmdbId} movie={m} selectedProviderKeys={selectedSet} index={i} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Saved — but not visible right now"
              description="Your watchlist has movies, but none are in the current discover slice. Switch to Discover and turn off filters to see them."
            />
          )}
          {watchlist.values.length > 0 && (
            <div className="flex items-center justify-end gap-2 pt-2 text-xs text-[var(--color-muted)]">
              <Heart className="h-3.5 w-3.5 fill-current text-rose-400" />
              {watchlist.values.length} saved
            </div>
          )}
        </section>
      )}

      {/* Discover — For-You rails view when DNA is set, else fall through to grid */}
      {tab === "discover" && rails && rails.length > 0 && (
        <section className="space-y-6" aria-label="Picked for you">
          <DnaBanner />
          <div className="space-y-8">
            {rails.map((spec) => (
              <Rail key={spec.id} spec={spec} selectedProviderKeys={selected} />
            ))}
          </div>
        </section>
      )}

      {/* Discover grid (legacy / cold-start without DNA) */}
      {tab === "discover" && !rails && (
        <section className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--color-muted)]" role="status" aria-live="polite" aria-atomic="true">
            <span>
              {loading && page === 1
                ? "Searching…"
                : error
                  ? "Something went wrong"
                  : `${visibleResults.length} ${visibleResults.length === 1 ? "movie" : "movies"}${activeFilters > 0 ? " · filtered" : ""}`}
            </span>
            {loading && page > 1 && <LoadingInline label="Loading more…" />}
            {hidden.values.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  hidden.clear();
                  toast.success("Restored hidden movies");
                }}
                className="ml-3 underline-offset-4 hover:underline"
              >
                Restore {hidden.values.length} hidden
              </button>
            )}
          </div>

          {error && (
            <EmptyState
              title="Couldn't load results"
              description={error}
              action={
                <button
                  className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-zinc-900 hover:brightness-105"
                  onClick={() => fetchResults({ page: 1, reset: true })}
                >
                  Retry
                </button>
              }
            />
          )}

          {!error && loading && visibleResults.length === 0 && <LoadingGrid />}

          {!error && !loading && visibleResults.length === 0 && (
            <EmptyState
              title="No movies match"
              description="Try widening the year range, clearing your mood, or turning off 'Only on my services'."
              action={
                <button
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                    setMoodKey(null);
                    setTimeBudget("any");
                    setYearBucket("any");
                  }}
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm hover:border-[var(--color-border-strong)]"
                >
                  Reset filters
                </button>
              }
            />
          )}

          {visibleResults.length > 0 && (
            <AnimatePresence mode="popLayout">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {visibleResults.map((m, i) => (
                  <MovieCard
                    key={m.tmdbId}
                    movie={m}
                    selectedProviderKeys={selectedSet}
                    index={i}
                  />
                ))}
              </div>
            </AnimatePresence>
          )}

          {visibleResults.length > 0 && page < totalPages && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                disabled={loading}
                onClick={() => fetchResults({ page: page + 1 })}
                className={cn(
                  "rounded-xl border px-5 py-2 text-sm font-medium transition",
                  loading
                    ? "border-[var(--color-border)] text-[var(--color-subtle)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]/60 text-[var(--color-text)] hover:border-[var(--color-border-strong)]",
                )}
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </section>
      )}

      <AnchorPrompt open={anchorPromptOpen} onOpenChange={setAnchorPromptOpen} />
    </div>
  );
}



function TonightContextBar({ ctx }: { ctx: TonightContext }) {
  const weatherEmoji: Record<string, string> = {
    "rainy-cold": "🌧",
    snowy: "❄️",
    stormy: "⛈",
    "hot-clear": "☀️",
    "mild-clear": "🌤",
    overcast: "☁️",
    foggy: "🌫",
    unknown: "🌙",
  };
  const holidayEmoji: Record<string, string> = {
    halloween: "🎃",
    christmas: "🎄",
    valentines: "💝",
    "new-year": "🎆",
    thanksgiving: "🍂",
    "independence-day": "🎇",
    pride: "🏳️‍🌈",
    "mothers-day": "💐",
    "fathers-day": "👔",
  };
  const bits: { icon: string; label: string }[] = [
    { icon: ctx.isDark ? "🌙" : "☀️", label: ctx.daypartLabel },
    { icon: weatherEmoji[ctx.weather] ?? "·", label: ctx.weather.replace(/-/g, " ") },
  ];
  if (ctx.holiday) {
    bits.unshift({ icon: holidayEmoji[ctx.holiday] ?? "✨", label: ctx.holiday.replace(/-/g, " ") });
  }
  if (ctx.city) bits.push({ icon: "📍", label: ctx.city });
  return (
    <div className="space-y-2">
      <div className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 text-[11px] sm:-mx-6 sm:px-6">
        {bits.map((b, i) => (
          <span
            key={i}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-1 text-[var(--color-muted)]"
          >
            <span aria-hidden>{b.icon}</span>
            <span className="capitalize">{b.label}</span>
          </span>
        ))}
      </div>
      {ctx.wildRubric && (
        <div className="flex items-start gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/60 p-3 text-[12px] text-[var(--color-text)]/85">
          <span className="rubric shrink-0" style={{ color: "var(--color-accent)", letterSpacing: "0.22em" }}>
            Today
          </span>
          <span className="italic">{ctx.wildRubric}</span>
        </div>
      )}
    </div>
  );
}

