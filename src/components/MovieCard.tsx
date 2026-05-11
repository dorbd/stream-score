"use client";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Heart, X } from "lucide-react";
import { toast } from "sonner";
import type { MovieResult, ProviderTag } from "@/lib/types";
import { getBrandSwatch } from "@/lib/providerBrands";
import { useWatchlist, useHidden } from "@/hooks/useLocalSet";
import { dur, ease } from "@/lib/motion";
import { cn } from "@/lib/cn";

function scoreColor(score: number | null): string {
  if (score == null) return "var(--color-subtle)";
  if (score >= 80) return "var(--color-good)";
  if (score >= 65) return "var(--color-warn)";
  if (score >= 45) return "var(--color-accent)";
  return "var(--color-bad)";
}

function titleGradient(title: string): string {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
  // Warm-shifted; bias toward 20-50 hue so fallback feels like the rest of the app.
  const baseH = 20 + (h % 30);
  const altH = baseH + 25;
  return `linear-gradient(135deg, oklch(0.30 0.07 ${baseH}), oklch(0.16 0.04 ${altH}))`;
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
  const score = movie.ratings.combined ?? movie.ratings.audience;
  const color = scoreColor(score);
  const isMatch = flat.some((p) => selectedProviderKeys.has(p.key));
  const watchlist = useWatchlist();
  const hidden = useHidden();
  const onWatchlist = watchlist.values.includes(movie.tmdbId);

  const barPx = score == null ? 0 : Math.max(4, Math.round((score / 100) * 56));

  const ariaLabel = `${movie.title}${movie.year ? `, ${movie.year}` : ""}${
    score != null ? `, score ${Math.round(score)} out of 100` : ", not rated"
  }${isMatch ? `, on your services` : ""}`;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: dur.regular,
        delay: reduce ? 0 : Math.min(index, 12) * 0.022,
        ease: ease.entrance,
      }}
      layout="position"
      className="group relative"
    >
      <Link
        href={`/movie/${movie.tmdbId}`}
        aria-label={ariaLabel}
        className="block rounded-[var(--radius-card)]"
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] transition-transform duration-300 group-hover:-translate-y-1">
          {/* The signature "on yours" edge bar */}
          {isMatch && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[3px] bg-[var(--color-accent)]"
              style={{ boxShadow: "0 0 18px 0 var(--color-accent)" }}
            />
          )}

          {movie.posterUrl ? (
            <motion.div
              layoutId={`poster-${movie.tmdbId}`}
              className="absolute inset-0"
            >
              <Image
                src={movie.posterUrl}
                alt=""
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                className="object-cover transition-opacity duration-300 group-hover:opacity-30"
              />
            </motion.div>
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
              style={{ backgroundImage: titleGradient(movie.title) }}
            >
              <span className="font-display line-clamp-4 text-xl leading-tight tracking-tight text-[var(--color-text)]/85">
                {movie.title}
              </span>
              {movie.year && (
                <span className="num-data mt-2 text-[10px] tracking-widest text-[var(--color-subtle)]">
                  {movie.year}
                </span>
              )}
            </div>
          )}

          {/* Hover info panel — slides up from bottom */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            aria-hidden
          >
            <div
              className="absolute inset-0 -z-10"
              style={{
                background:
                  "linear-gradient(to top, var(--color-bg) 0%, oklch(0.16 0.04 25 / 0.78) 60%, transparent 100%)",
              }}
            />
            <h3 className="line-clamp-2 text-[14px] font-semibold leading-tight text-[var(--color-text)]">
              {movie.title}
            </h3>
            <div className="num-prose text-[11px] uppercase tracking-wider text-[var(--color-muted)]">
              {[movie.year, movie.runtime && `${movie.runtime} min`, movie.genres[0]]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {movie.overview && (
              <p className="line-clamp-2 text-[12px] leading-snug text-[var(--color-text)]/80">
                {movie.overview}
              </p>
            )}
            {flat.length > 0 && <ProviderLogoStrip flat={flat} matched={selectedProviderKeys} />}
          </div>

          {/* Persistent watchlist heart when ON */}
          {onWatchlist && (
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-3 z-20 text-[var(--color-accent)] drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]"
            >
              <Heart className="h-5 w-5" fill="currentColor" strokeWidth={1.5} />
            </span>
          )}
        </div>

        {/* Metadata row: mono score + ember underline + title + year */}
        <div className="mt-2.5 flex items-start gap-3 px-0.5">
          {score != null && (
            <div className="shrink-0 pt-0.5">
              <div className="num-data text-[18px] font-semibold leading-none text-[var(--color-text)]">
                {Math.round(score)}
              </div>
              <div
                className="mt-1 h-[2px] rounded-full transition-[width] duration-300"
                style={{ width: `${barPx}px`, background: color, maxWidth: "100%" }}
              />
            </div>
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <h2 className="line-clamp-1 text-[13px] font-medium tracking-tight text-[var(--color-text)]">
              {movie.title}
            </h2>
            <div className="num-prose mt-0.5 text-[11px] text-[var(--color-muted)]">
              {movie.year ?? "—"}
              {movie.runtime ? ` · ${movie.runtime}m` : ""}
            </div>
          </div>
        </div>
      </Link>

      {/* Hover-only watchlist toggle (when OFF) and hide button */}
      <div className="pointer-events-none absolute right-2 top-2 z-30 flex flex-col gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
        {!onWatchlist && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              watchlist.toggle(movie.tmdbId);
              toast.success("Added to watchlist", { duration: 1200 });
            }}
            className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/10 backdrop-blur transition hover:scale-110"
            aria-label="Add to watchlist"
          >
            <Heart className="h-4 w-4" />
          </button>
        )}
        {onWatchlist && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              watchlist.toggle(movie.tmdbId);
              toast.success("Removed from watchlist", { duration: 1200 });
            }}
            className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/10 backdrop-blur transition hover:scale-110"
            aria-label="Remove from watchlist"
          >
            <Heart className="h-4 w-4" fill="currentColor" />
          </button>
        )}
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
          className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/10 backdrop-blur transition hover:scale-110"
          aria-label="Hide this movie"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

function ProviderLogoStrip({
  flat,
  matched,
}: {
  flat: ProviderTag[];
  matched: Set<string>;
}) {
  const ordered = [
    ...flat.filter((p) => matched.has(p.key)),
    ...flat.filter((p) => !matched.has(p.key)),
  ].slice(0, 5);
  return (
    <ul className="flex items-center gap-1.5" aria-label="Available on">
      {ordered.map((p) => {
        const swatch = getBrandSwatch(p.key);
        const isMatched = matched.has(p.key);
        return (
          <li
            key={p.id}
            title={p.name}
            className={cn(
              "h-5 w-5 overflow-hidden rounded-md ring-1 ring-white/10 transition",
              !isMatched && "opacity-40 saturate-50",
            )}
            style={{ background: `${swatch.bg}22` }}
          >
            <span className="sr-only">{p.name}</span>
            {p.logoUrl ? (
              <Image src={p.logoUrl} alt="" width={20} height={20} className="h-full w-full object-contain p-[2px]" />
            ) : (
              <span className="block h-full w-full" style={{ background: swatch.bg }} />
            )}
          </li>
        );
      })}
      {flat.length > ordered.length && (
        <li className="num-data text-[10px] text-[var(--color-subtle)]">
          +{flat.length - ordered.length}
        </li>
      )}
    </ul>
  );
}
