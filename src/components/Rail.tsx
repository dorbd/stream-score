"use client";

// Rail — horizontal, snap-scrolling row of MovieCards.
//
// Fetches `/api/discover?${spec.query}` on mount, renders 4-5 cards on
// desktop and 2.5 on mobile with mandatory snap-x. The tooltip ⓘ button
// reveals the rationale inline as italic.
//
// Empty-state behavior: if the rail returns fewer than 3 visible movies
// we collapse it with a "Nothing here on your services" message. The
// caller controls services via the `selectedProviderKeys` prop (and is
// expected to have already encoded them into `spec.query`).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { MovieCard } from "@/components/MovieCard";
import { cn } from "@/lib/cn";
import type { DiscoverResponse, MovieResult } from "@/lib/types";

export interface RailSpec {
  id: string;
  label: string;
  rationale: string;
  query: URLSearchParams;
}

interface RailProps {
  spec: RailSpec;
  selectedProviderKeys: string[];
}

const SHOWN_DESKTOP = 5;

export function Rail({ spec, selectedProviderKeys }: RailProps) {
  const [movies, setMovies] = useState<MovieResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [showRationale, setShowRationale] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    const reqId = ++reqRef.current;
    let canceled = false;
    // Defer reset state-updates one microtask so we don't trigger a cascading
    // render inside the effect body itself.
    Promise.resolve().then(() => {
      if (canceled || reqId !== reqRef.current) return;
      setError(null);
      setMovies(null);
    });
    fetch(`/api/discover?${spec.query.toString()}`)
      .then(async (res) => {
        if (canceled || reqId !== reqRef.current) return;
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Failed: ${res.status}`);
        }
        const data = (await res.json()) as DiscoverResponse;
        if (canceled || reqId !== reqRef.current) return;
        setMovies(data.results);
        setTotalResults(data.totalResults ?? data.results.length);
      })
      .catch((e: unknown) => {
        if (canceled || reqId !== reqRef.current) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      canceled = true;
    };
  }, [spec.query]);

  const selectedSet = new Set(selectedProviderKeys);

  // Empty state — fewer than 3 results collapses the rail with copy.
  if (movies && movies.length < 3) {
    return (
      <section className="space-y-2" aria-label={spec.label}>
        <RailHeader
          spec={spec}
          open={showRationale}
          onToggle={() => setShowRationale((v) => !v)}
        />
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/30 px-4 py-6 text-center text-[13px] text-[var(--color-muted)]">
          Nothing here on your services.{" "}
          <Link href="/settings" className="underline-offset-4 hover:underline">
            Add a service
          </Link>{" "}
          or try another rail.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label={spec.label}>
      <RailHeader
        spec={spec}
        open={showRationale}
        onToggle={() => setShowRationale((v) => !v)}
      />

      {error && (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-warn)]/40 bg-[var(--color-surface)]/40 px-4 py-3 text-[13px] text-[var(--color-muted)]">
          Couldn&apos;t load this rail. {error}
        </div>
      )}

      <div
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto scroll-px-4 px-4 sm:-mx-6 sm:px-6"
        role="list"
      >
        {/* Loading state — 5 ghost posters */}
        {!movies && !error &&
          Array.from({ length: 5 }).map((_, i) => (
            <RailSkeleton key={`sk-${i}`} />
          ))}

        {movies &&
          movies.slice(0, SHOWN_DESKTOP).map((m, i) => (
            <div
              key={m.tmdbId}
              role="listitem"
              className="w-[44vw] shrink-0 snap-start sm:w-[180px]"
            >
              <MovieCard
                movie={m}
                selectedProviderKeys={selectedSet}
                index={i}
              />
            </div>
          ))}

        {movies && totalResults > SHOWN_DESKTOP && (
          <Link
            href={`/?from_rail=${encodeURIComponent(spec.id)}`}
            className="flex w-[44vw] shrink-0 snap-start items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/30 px-4 text-center text-[13px] text-[var(--color-muted)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] sm:w-[180px]"
            aria-label={`See more in ${spec.label}`}
          >
            +{Math.max(totalResults - SHOWN_DESKTOP, 1)} more like this
          </Link>
        )}
      </div>
    </section>
  );
}

function RailHeader({
  spec,
  open,
  onToggle,
}: {
  spec: RailSpec;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-[20px] leading-tight text-[var(--color-text)] sm:text-[24px]">
          {spec.label}
        </h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Hide rationale" : "Show rationale"}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-subtle)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]",
            open && "border-[var(--color-accent)]/50 text-[var(--color-accent)]",
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <p className="max-w-2xl text-[12px] italic leading-snug text-[var(--color-muted)]">
          {spec.rationale}
        </p>
      )}
    </div>
  );
}

function RailSkeleton() {
  return (
    <div className="w-[44vw] shrink-0 snap-start sm:w-[180px]">
      <div className="aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]/40">
        <div className="h-full w-full shimmer" />
      </div>
      <div className="mt-2.5 space-y-1.5">
        <div className="h-3 w-3/4 rounded shimmer" />
        <div className="h-2.5 w-1/2 rounded shimmer" />
      </div>
    </div>
  );
}
