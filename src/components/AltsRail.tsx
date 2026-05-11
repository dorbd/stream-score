"use client";
// Horizontal "Alts" rail. Receives an already-ranked list of MovieResults
// from the caller — this component is purely presentational + tracks
// impressions and hover dwell.

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import type { MovieResult } from "@/lib/types";
import { dur, ease } from "@/lib/motion";
import { observeImpressions, trackHoverDwell } from "@/lib/track";
import { cn } from "@/lib/cn";

const SURFACE = "alts";

export interface AltsRailProps {
  picks: MovieResult[];
  label?: string;
  className?: string;
}

export function AltsRail({ picks, label = "Backup picks", className }: AltsRailProps) {
  const reduce = useReducedMotion();
  const railRef = useRef<HTMLUListElement | null>(null);
  // Limit to first 5 — that's the contract.
  const items = useMemo(() => picks.slice(0, 5), [picks]);

  // Track impressions for every card the rail renders.
  useEffect(() => {
    const root = railRef.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-tmdb-id]"));
    const teardown = observeImpressions(cards, {
      surface: SURFACE,
      resolveId: (el) => {
        const v = (el as HTMLElement).dataset.tmdbId;
        const n = v ? Number(v) : NaN;
        return Number.isFinite(n) ? n : null;
      },
    });
    return teardown;
  }, [items]);

  if (items.length === 0) return null;

  return (
    <section
      className={cn("flex flex-col gap-2", className)}
      aria-label={label}
    >
      <header className="flex items-baseline justify-between px-1">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-muted)]">
          {label}
        </h2>
        <span className="text-[11px] text-[var(--color-subtle)]">
          {items.length} alts
        </span>
      </header>
      <ul
        ref={railRef}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]"
        role="list"
      >
        {items.map((m, idx) => (
          <motion.li
            key={m.tmdbId}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: dur.regular,
              delay: reduce ? 0 : idx * 0.04,
              ease: ease.entrance,
            }}
            className="w-[148px] shrink-0 snap-start sm:w-[168px]"
          >
            <AltCard movie={m} />
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

function AltCard({ movie }: { movie: MovieResult }) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return trackHoverDwell(el, { tmdbId: movie.tmdbId, surface: SURFACE });
  }, [movie.tmdbId]);

  const score = movie.ratings.combined ?? movie.ratings.audience;

  return (
    <Link
      ref={ref}
      href={`/movie/${movie.tmdbId}`}
      data-tmdb-id={movie.tmdbId}
      className="group block"
      aria-label={`${movie.title}${movie.year ? `, ${movie.year}` : ""}`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] transition-transform duration-300 group-hover:-translate-y-0.5">
        {movie.posterUrl ? (
          <Image
            src={movie.posterUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, 180px"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-3 text-center">
            <span className="font-display line-clamp-3 text-base leading-tight tracking-tight text-[var(--color-text)]/85">
              {movie.title}
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-start gap-2 px-0.5">
        {score != null && (
          <div className="num-data shrink-0 text-[13px] font-semibold leading-none text-[var(--color-text)]">
            {Math.round(score)}
          </div>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="line-clamp-1 text-[12px] font-medium tracking-tight text-[var(--color-text)]">
            {movie.title}
          </div>
          <div className="num-prose mt-0.5 text-[10px] text-[var(--color-muted)]">
            {movie.year ?? "—"}
            {movie.runtime ? ` · ${movie.runtime}m` : ""}
          </div>
        </div>
      </div>
    </Link>
  );
}
