"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
import { PROVIDER_BY_KEY } from "@/lib/providers";
import { getBrandSwatch } from "@/lib/providerBrands";
import { MOODS } from "@/lib/moods";
import { cn } from "@/lib/cn";
import type { DiscoverResponse, MovieResult, TmdbGenre } from "@/lib/types";

interface TonightMeta {
  finalScore: number;
  boost: number;
  reasons: { key: string; magnitude: number; phrase: string }[];
  reasonSentence: string;
  daypart: string;
}
interface TonightContext {
  daypart: string;
  daypartLabel: string;
  hourLocal: number;
  timezone: string;
  city: string | null;
  weather: string;
  isDark: boolean;
  holiday: string | null;
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
      if (filters.yearMin) params.set("year_min", String(filters.yearMin));
      if (filters.yearMax) params.set("year_max", String(filters.yearMax));
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
    [filters, selected, hidden.values, moodKey, timeBudget],
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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults({ page: 1, reset: true });
    }, filters.query ? 280 : 60);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchResults, showOnboarding, tab, filters.query]);

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

  const activeFilters = countActiveFilters(filters) + (moodKey ? 1 : 0) + (timeBudget !== "any" ? 1 : 0);

  // Tonight tab — calls /api/tonight to get smart-reranked picks
  const [tonightLoading, setTonightLoading] = useState(false);
  const [tonightPick, setTonightPick] = useState<MovieResult & { _tonight?: TonightMeta } | null>(null);
  const [tonightAlts, setTonightAlts] = useState<(MovieResult & { _tonight?: TonightMeta })[]>([]);
  const [tonightCtx, setTonightCtx] = useState<TonightContext | null>(null);

  useEffect(() => {
    if (tab !== "tonight") return;
    let canceled = false;
    Promise.resolve().then(() => {
      if (!canceled) setTonightLoading(true);
    });
    const params = new URLSearchParams();
    if (selected.length) params.set("providers", selected.join(","));
    if (selected.length && filters.onlyMine) params.set("only_mine", "true");
    else if (!filters.onlyMine) params.set("only_mine", "false");
    if (watchlist.values.length) params.set("watchlist", watchlist.values.join(","));
    if (hidden.values.length) params.set("hide", hidden.values.join(","));
    const moodGenres = moodKey ? (MOODS.find((m) => m.key === moodKey)?.genres ?? []) : [];
    if (moodGenres.length) params.set("genres", moodGenres.join(","));
    fetch(`/api/tonight?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (canceled) return;
        if (data.error) {
          setTonightPick(null);
          setTonightAlts([]);
          return;
        }
        setTonightPick(data.pick ?? null);
        setTonightAlts(data.alts ?? []);
        setTonightCtx(data.context ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!canceled) setTonightLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [tab, selected, watchlist.values, hidden.values, filters.onlyMine, moodKey]);

  // Existing discover grid still uses the discover endpoint
  const topPick = tonightPick ?? visibleResults[0];
  const alts = tonightAlts.length ? tonightAlts : visibleResults.slice(1, 4);

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

      {/* Mood chips (Discover + Tonight only) */}
      {tab !== "watchlist" && (
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

      {/* Search + sort + filter + time + onlyMine */}
      {tab !== "watchlist" && (
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
        </div>
      )}

      {/* Tonight tab: cinematic hero + alts ribbon */}
      {tab === "tonight" && !error && (
        <section className="space-y-6" aria-live="polite">
          {tonightCtx && <TonightContextBar ctx={tonightCtx} />}
          {tonightLoading && !topPick && <LoadingGrid count={4} />}
          {topPick && (
            <TonightHero
              movie={topPick}
              meta={(topPick as MovieResult & { _tonight?: TonightMeta })._tonight}
              reduce={!!reduce}
            />
          )}
          {alts.length > 0 && (
            <div>
              <div className="rubric mb-2" style={{ letterSpacing: "0.24em" }}>Or maybe</div>
              <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
                {alts.map((m, i) => (
                  <div key={m.tmdbId} className="w-[44vw] shrink-0 snap-center sm:w-[220px]">
                    <MovieCard movie={m} selectedProviderKeys={selectedSet} index={i} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {!tonightLoading && !topPick && (
            <EmptyState
              title="The marquee's dark tonight."
              description="Drop a filter or two and the lights come back on."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                    setMoodKey(null);
                    setTimeBudget("any");
                  }}
                  className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-bg)]"
                >
                  Reset filters
                </button>
              }
            />
          )}
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

      {/* Discover grid */}
      {tab === "discover" && (
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
    </div>
  );
}

function scoreTextColor(score: number | null | undefined): string {
  if (score == null) return "var(--color-subtle)";
  if (score >= 80) return "var(--color-good)";
  if (score >= 65) return "var(--color-warn)";
  if (score >= 45) return "var(--color-accent)";
  return "var(--color-bad)";
}

function TonightHero({
  movie,
  meta: tMeta,
  reduce,
}: {
  movie: MovieResult;
  meta?: TonightMeta;
  reduce: boolean;
}) {
  const score = tMeta?.finalScore ?? movie.ratings.combined ?? movie.ratings.audience;
  const color = scoreTextColor(score);
  const now = new Date();
  const dateRubric = now
    .toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toUpperCase();
  const imdb = movie.ratings.imdb;
  const rt = movie.ratings.rottenTomatoes;
  const meta = movie.ratings.metacritic;

  return (
    <Link
      href={`/movie/${movie.tmdbId}`}
      className="group relative -mx-4 block overflow-hidden border-y border-[var(--color-border)] sm:-mx-6 sm:rounded-[var(--radius-hero)] sm:border"
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_minmax(200px,260px)]">
        {/* Backdrop column */}
        <motion.div
          className="backdrop-undertow relative aspect-[16/10] w-full sm:aspect-[4/5] sm:min-h-[420px]"
          initial={reduce ? false : { scale: 1.04 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        >
          {movie.backdropUrl ? (
            <div className="absolute inset-0">
              <Image
                src={movie.backdropUrl}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 720px"
                priority
                className="object-cover"
              />
            </div>
          ) : null}
          <div
            aria-hidden
            className="absolute inset-0 z-[2]"
            style={{
              background:
                "linear-gradient(to top, var(--color-bg) 0%, oklch(0.13 0.03 28 / 0.55) 45%, transparent 100%)",
            }}
          />
          <div className="absolute inset-x-0 bottom-0 z-[3] p-5 sm:p-7">
            <div className="rubric mb-2" style={{ color: "var(--color-accent)", letterSpacing: "0.24em" }}>
              Pick · Tonight · {dateRubric}
            </div>
            <h2 className="font-display text-3xl leading-[1.02] tracking-[-0.02em] sm:text-5xl">
              {movie.title}
            </h2>
            <div className="num-prose mt-1.5 text-[12px] uppercase tracking-wider text-[var(--color-muted)]">
              {movie.year ?? "—"}
              {movie.runtime ? ` · ${movie.runtime} min` : ""}
              {movie.genres[0] ? ` · ${movie.genres.slice(0, 2).join(", ")}` : ""}
            </div>
            <p className="mt-3 line-clamp-2 max-w-xl text-sm text-[var(--color-text)]/85">
              {movie.overview}
            </p>
            {tMeta?.reasonSentence && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-wash)] px-3 py-1.5 text-xs text-[var(--color-text)]">
                <span className="rubric" style={{ color: "var(--color-accent)", letterSpacing: "0.22em" }}>
                  Why
                </span>
                <span className="text-[12px]">{tMeta.reasonSentence}</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Score column */}
        <div className="flex flex-col items-center justify-center gap-5 bg-[var(--color-bg-elevated)] px-5 py-7 sm:px-6">
          <div className="rubric" style={{ letterSpacing: "0.24em" }}>
            Combined score
          </div>
          <div className="relative">
            <span
              aria-hidden
              className="absolute inset-0 -z-10 rounded-full blur-2xl"
              style={{ background: color, opacity: 0.25 }}
            />
            <div
              className="num-hero leading-none"
              style={{
                color,
                fontSize: "clamp(96px, 14vw, 128px)",
                fontWeight: 400,
              }}
            >
              {score == null ? "—" : Math.round(score)}
            </div>
          </div>
          <ScoreMicroBars imdb={imdb} rt={rt} meta={meta} />
        </div>
      </div>
    </Link>
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
  );
}

function ScoreMicroBars({
  imdb,
  rt,
  meta,
}: {
  imdb: number | null;
  rt: number | null;
  meta: number | null;
}) {
  const rows: { label: string; value: number | null; max: number }[] = [
    { label: "IMDb", value: imdb, max: 100 },
    { label: "RT", value: rt, max: 100 },
    { label: "Meta", value: meta, max: 100 },
  ];
  return (
    <ul className="w-full max-w-[160px] space-y-1.5">
      {rows.map((r) => {
        const pct = r.value == null ? 0 : (r.value / r.max) * 100;
        return (
          <li key={r.label} className="flex items-center gap-2">
            <span className="rubric w-9 text-left" style={{ letterSpacing: "0.18em" }}>
              {r.label}
            </span>
            <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-text)]"
                style={{ width: `${pct}%`, opacity: r.value == null ? 0 : 0.85 }}
              />
            </span>
            <span className="num-data w-6 text-right text-[10px] text-[var(--color-muted)]">
              {r.value == null ? "—" : Math.round(r.value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
