"use client";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Check, Film, Heart, X } from "lucide-react";
import { toast } from "sonner";
import type { MovieResult } from "@/lib/types";
import { getBrandSwatch } from "@/lib/providerBrands";
import { useWatchlist, useHidden } from "@/hooks/useLocalSet";
import { cn } from "@/lib/cn";

function scoreColor(score: number | null): string {
  if (score == null) return "var(--color-subtle)";
  if (score >= 80) return "var(--color-good)";
  if (score >= 65) return "var(--color-warn)";
  if (score >= 45) return "var(--color-accent)";
  return "var(--color-bad)";
}

export function MovieCard({
  movie,
  selectedProviderKeys,
  index = 0,
}: {
  movie: MovieResult;
  selectedProviderKeys: Set<string>;
  index?: number;
}) {
  const reduce = useReducedMotion();
  const flat = movie.availability.flatrate;
  const userMatches = flat.filter((p) => selectedProviderKeys.has(p.key));
  const score = movie.ratings.combined ?? movie.ratings.audience;
  const color = scoreColor(score);
  const isMatch = userMatches.length > 0;
  const watchlist = useWatchlist();
  const hidden = useHidden();
  const onWatchlist = watchlist.values.includes(movie.tmdbId);

  const dotOrder = [
    ...userMatches,
    ...flat.filter((p) => !selectedProviderKeys.has(p.key)),
  ].slice(0, 4);

  const ariaLabel = `${movie.title}${movie.year ? `, ${movie.year}` : ""}${
    score != null ? `, score ${Math.round(score)} out of 100` : ", not rated"
  }${isMatch ? `, on your services` : ""}`;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: reduce ? 0 : Math.min(index, 12) * 0.022, ease: [0.2, 0.7, 0.2, 1] }}
      whileHover={reduce ? undefined : { y: -3 }}
      className="group relative"
    >
      <Link
        href={`/movie/${movie.tmdbId}`}
        aria-label={ariaLabel}
        className="relative block overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 shadow-sm transition hover:border-[var(--color-border-strong)] hover:shadow-lg"
      >
        {/* edge bar for "on yours" */}
        {isMatch && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[3px] bg-[var(--color-accent)] shadow-[0_0_16px_var(--color-accent)]"
          />
        )}

        <div className="relative aspect-[2/3] w-full overflow-hidden bg-[var(--color-surface)]">
          {movie.posterUrl ? (
            <Image
              src={movie.posterUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <Film className="absolute inset-0 m-auto h-10 w-10 text-[var(--color-subtle)]" aria-hidden />
          )}

          {/* score chip */}
          <div
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-black/75 px-2 py-1 font-mono text-[13px] font-bold tabular-nums ring-1 ring-white/10 backdrop-blur"
            aria-hidden
            style={{ color }}
          >
            {score == null ? "—" : Math.round(score)}
            <span className="ml-0.5 text-[9px] font-medium tracking-wider text-white/60">
              /100
            </span>
          </div>

          {/* On-yours check */}
          {isMatch && (
            <span
              className="absolute left-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-accent)] text-zinc-900 shadow-lg"
              aria-hidden
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
          )}

          {/* legibility gradient */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/30 to-transparent" aria-hidden />

          {/* dots */}
          {dotOrder.length > 0 && (
            <ul aria-label="Available on" className="absolute bottom-2 left-2 z-10 flex items-center gap-1">
              {dotOrder.map((p) => {
                const swatch = getBrandSwatch(p.key);
                const matched = selectedProviderKeys.has(p.key);
                return (
                  <li key={p.id} title={p.name}>
                    <span className="sr-only">{p.name}</span>
                    <span
                      aria-hidden
                      className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        matched && "ring-1 ring-white/80",
                      )}
                      style={{ background: swatch.bg }}
                    />
                  </li>
                );
              })}
              {flat.length > dotOrder.length && (
                <li className="ml-0.5 font-mono text-[9px] text-white/80">
                  +{flat.length - dotOrder.length}
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="space-y-1 p-2.5">
          <h2 className="line-clamp-1 text-sm font-semibold leading-tight tracking-tight text-[var(--color-text)]">
            {movie.title}
            <span className="ml-1.5 font-mono text-[11px] font-normal tabular-nums text-[var(--color-muted)]">
              {movie.year ?? ""}
            </span>
          </h2>
          {(movie.runtime || movie.genres[0]) && (
            <div className="line-clamp-1 text-[11px] text-[var(--color-muted)]">
              {movie.runtime ? `${movie.runtime}m` : ""}
              {movie.runtime && movie.genres[0] ? " · " : ""}
              {movie.genres[0] ?? ""}
            </div>
          )}
        </div>
      </Link>

      {/* Floating actions outside the link so they don't trigger navigation */}
      <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col gap-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const wasOn = watchlist.has(movie.tmdbId);
            watchlist.toggle(movie.tmdbId);
            toast.success(wasOn ? `Removed from watchlist` : `Added to watchlist`, { duration: 1200 });
          }}
          className={cn(
            "pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/10 backdrop-blur transition hover:scale-110",
            onWatchlist && "bg-rose-500 ring-rose-300",
          )}
          aria-label={onWatchlist ? "Remove from watchlist" : "Add to watchlist"}
        >
          <Heart className="h-4 w-4" fill={onWatchlist ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            hidden.add(movie.tmdbId);
            toast(`Hidden — won't show again`, {
              action: {
                label: "Undo",
                onClick: () => hidden.remove(movie.tmdbId),
              },
              duration: 4000,
            });
          }}
          className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/10 backdrop-blur transition hover:scale-110"
          aria-label="Hide this movie"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
