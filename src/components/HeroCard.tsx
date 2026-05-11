"use client";

// The ONE big card. Replaces hero+alts on the Tonight tab when
// NEXT_PUBLIC_HERO_V2 is set. Reads from /api/daily-pick. Renders an
// editorial, full-bleed presentation: backdrop, big title, LLM caption,
// score, provider strip, CTA. Falls back to a graceful skeleton/empty.

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Sparkles, ArrowUpRight, Play } from "lucide-react";
import { dur, ease } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { getBrandSwatch } from "@/lib/providerBrands";
import type { MovieResult } from "@/lib/types";

interface DailyPickResponse {
  bucket: {
    key: string;
    country: string;
    servicesHash: string;
    hourBucket: string;
    weatherBucket: string;
    weekday: number;
    holidayFlag: string;
  };
  hero: (MovieResult & { caption: string }) | null;
  alts: MovieResult[];
  source: "llm" | "fallback";
  context: {
    daypart: string;
    daypartLabel: string;
    weather: string;
    holiday: string | null;
  };
  cached: boolean;
  generatedAt: number;
}

export interface HeroCardProps {
  selectedProviderKeys?: string[];
  className?: string;
  /** If true, render an inline skeleton on initial mount instead of nothing. */
  showSkeleton?: boolean;
}

function scoreColor(score: number | null): string {
  if (score == null) return "var(--color-subtle)";
  if (score >= 80) return "var(--color-good)";
  if (score >= 65) return "var(--color-warn)";
  if (score >= 45) return "var(--color-accent)";
  return "var(--color-bad)";
}

export function HeroCard({ selectedProviderKeys = [], className, showSkeleton = true }: HeroCardProps) {
  const reduce = useReducedMotion();
  const providersKey = selectedProviderKeys.join(",");
  const [state, setState] = useState<{
    data: DailyPickResponse | null;
    loading: boolean;
    error: string | null;
    forKey: string;
  }>({ data: null, loading: true, error: null, forKey: providersKey });

  // Reset to loading if the providers prop changes between renders.
  if (state.forKey !== providersKey) {
    setState({ data: null, loading: true, error: null, forKey: providersKey });
  }

  useEffect(() => {
    let canceled = false;
    const params = new URLSearchParams();
    if (selectedProviderKeys.length) params.set("providers", selectedProviderKeys.join(","));
    fetch(`/api/daily-pick${params.size ? `?${params.toString()}` : ""}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as DailyPickResponse | { error: string };
      })
      .then((j) => {
        if (canceled) return;
        if ("error" in j) {
          setState({ data: null, loading: false, error: j.error, forKey: providersKey });
        } else {
          setState({ data: j, loading: false, error: null, forKey: providersKey });
        }
      })
      .catch((e) => {
        if (canceled) return;
        const msg = e instanceof Error ? e.message : "fetch failed";
        setState({ data: null, loading: false, error: msg, forKey: providersKey });
      });
    return () => {
      canceled = true;
    };
  }, [providersKey, selectedProviderKeys]);

  const { data, loading, error } = state;

  if (loading && !data) {
    return showSkeleton ? <HeroSkeleton className={className} /> : null;
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-[var(--radius-hero)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-8 text-center",
          className,
        )}
      >
        <p className="text-sm text-[var(--color-muted)]">Tonight&apos;s pick is taking a moment.</p>
        <p className="num-prose mt-1 text-[11px] text-[var(--color-subtle)]">{error}</p>
      </div>
    );
  }

  const hero = data?.hero ?? null;
  if (!hero) {
    return (
      <div
        className={cn(
          "rounded-[var(--radius-hero)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-8 text-center",
          className,
        )}
      >
        <p className="text-sm text-[var(--color-muted)]">Nothing fits the moment right now.</p>
      </div>
    );
  }

  const score = hero.ratings.combined ?? hero.ratings.audience;
  const accent = scoreColor(score);
  const matched = new Set(selectedProviderKeys);
  const flat = hero.availability.flatrate;
  const onYours = flat.some((p) => matched.has(p.key));
  const alts = data?.alts ?? [];

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.scenic, ease: ease.entrance }}
      className={cn(
        "group relative overflow-hidden rounded-[var(--radius-hero)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
        "shadow-[0_24px_60px_-30px_rgba(0,0,0,0.85)]",
        className,
      )}
      aria-label={`Tonight's pick: ${hero.title}`}
    >
      {/* Backdrop */}
      <div className="relative aspect-[16/9] w-full sm:aspect-[21/9]">
        {hero.backdropUrl ? (
          <Image
            src={hero.backdropUrl}
            alt=""
            fill
            priority
            sizes="(max-width: 768px) 100vw, 90vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-surface-2)] to-[var(--color-bg)]" />
        )}
        {/* Vignette + amber undertow */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, var(--color-bg-elevated) 8%, oklch(0.12 0.03 30 / 0.55) 45%, transparent 80%), radial-gradient(60% 70% at 30% 30%, var(--color-accent-wash) 0%, transparent 70%)",
          }}
        />

        {/* Source badge */}
        <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] uppercase tracking-widest text-white/90 ring-1 ring-white/10 backdrop-blur">
          <Sparkles className="h-3 w-3" aria-hidden />
          {data?.source === "llm" ? "Curated" : "Tonight"}
        </div>

        {/* On-your-services dot */}
        {onYours && (
          <div className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/30 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            On yours
          </div>
        )}
      </div>

      {/* Content over the gradient — sits inside the same bordered card */}
      <div className="relative z-10 -mt-24 px-5 pb-6 pt-0 sm:-mt-32 sm:px-8 sm:pb-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            {/* Poster thumb */}
            {hero.posterUrl && (
              <div className="relative hidden h-[140px] w-[94px] shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 shadow-[0_8px_30px_-10px_rgba(0,0,0,0.7)] sm:block">
                <Image
                  src={hero.posterUrl}
                  alt=""
                  fill
                  sizes="94px"
                  className="object-cover"
                />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h1 className="font-display line-clamp-2 text-[34px] leading-[0.95] tracking-tight text-[var(--color-text)] sm:text-[44px]">
                {hero.title}
              </h1>
              <div className="num-prose mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] uppercase tracking-widest text-[var(--color-muted)]">
                {hero.year && <span>{hero.year}</span>}
                {hero.runtime && <span>{hero.runtime} min</span>}
                {hero.genres[0] && <span>{hero.genres.slice(0, 2).join(" / ")}</span>}
                {data?.context.daypartLabel && (
                  <span className="text-[var(--color-subtle)]">· {data.context.daypartLabel}</span>
                )}
              </div>
            </div>

            {/* Score */}
            {score != null && (
              <div className="flex shrink-0 flex-col items-end pt-1">
                <div className="num-data text-[42px] font-semibold leading-none text-[var(--color-text)] sm:text-[52px]">
                  {Math.round(score)}
                </div>
                <div
                  className="mt-2 h-[3px] w-12 rounded-full"
                  style={{ background: accent }}
                />
              </div>
            )}
          </div>

          {/* Caption — the LLM's one-sentence editorial */}
          {hero.caption && (
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: dur.regular, delay: reduce ? 0 : 0.12, ease: ease.entrance }}
              className="font-display max-w-2xl text-[17px] leading-snug text-[var(--color-text)]/90 sm:text-[19px]"
            >
              <span aria-hidden className="mr-2 text-[var(--color-accent)]">&ldquo;</span>
              {hero.caption}
              <span aria-hidden className="ml-1 text-[var(--color-accent)]">&rdquo;</span>
            </motion.p>
          )}

          {/* Providers + CTA */}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
            {flat.length > 0 ? (
              <ul className="flex items-center gap-2" aria-label="Available on">
                {flat.slice(0, 6).map((p) => {
                  const swatch = getBrandSwatch(p.key);
                  const isMatched = matched.has(p.key);
                  return (
                    <li
                      key={p.id}
                      title={p.name}
                      className={cn(
                        "h-7 w-7 overflow-hidden rounded-md ring-1 ring-white/10 transition",
                        !isMatched && matched.size > 0 && "opacity-45 saturate-50",
                      )}
                      style={{ background: `${swatch.bg}22` }}
                    >
                      <span className="sr-only">{p.name}</span>
                      {p.logoUrl ? (
                        <Image
                          src={p.logoUrl}
                          alt=""
                          width={28}
                          height={28}
                          className="h-full w-full object-contain p-[3px]"
                        />
                      ) : (
                        <span className="block h-full w-full" style={{ background: swatch.bg }} />
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <span className="num-prose text-[11px] uppercase tracking-widest text-[var(--color-subtle)]">
                Not on a major streamer
              </span>
            )}

            <div className="flex items-center gap-2">
              {hero.availability.link && (
                <a
                  href={hero.availability.link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black/90 transition hover:brightness-110"
                >
                  <Play className="h-4 w-4" aria-hidden />
                  Watch tonight
                </a>
              )}
              <Link
                href={`/movie/${hero.tmdbId}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-strong)] bg-transparent px-3.5 py-2 text-sm text-[var(--color-text)]/90 transition hover:bg-[var(--color-surface)]"
              >
                Details
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          {/* Inline alts — tiny rail of 5 small alternatives */}
          {alts.length > 0 && (
            <div className="mt-4 border-t border-[var(--color-border)]/60 pt-4">
              <div className="num-prose mb-2 text-[10px] uppercase tracking-widest text-[var(--color-subtle)]">
                Also tonight
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-2">
                {alts.slice(0, 5).map((m) => (
                  <li key={m.tmdbId} className="min-w-0">
                    <Link
                      href={`/movie/${m.tmdbId}`}
                      className="group/alt inline-flex max-w-[18rem] items-center gap-2 truncate text-[13px] text-[var(--color-text)]/80 transition hover:text-[var(--color-text)]"
                    >
                      <span className="num-data text-[11px] text-[var(--color-subtle)]">
                        {m.ratings.combined != null ? Math.round(m.ratings.combined) : "—"}
                      </span>
                      <span className="truncate underline-offset-2 group-hover/alt:underline">
                        {m.title}
                      </span>
                      {m.year && (
                        <span className="num-prose text-[11px] text-[var(--color-subtle)]">
                          {m.year}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function HeroSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-hero)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
        className,
      )}
    >
      <div className="aspect-[16/9] w-full animate-pulse bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-bg-elevated)] sm:aspect-[21/9]" />
      <div className="space-y-3 px-6 pb-6 pt-4">
        <div className="h-8 w-3/4 animate-pulse rounded bg-[var(--color-surface)]" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--color-surface)]" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--color-surface)]" />
      </div>
    </div>
  );
}
