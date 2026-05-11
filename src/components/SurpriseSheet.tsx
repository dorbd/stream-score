"use client";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Dices, Loader2, X, Heart } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSelectedProviders } from "@/hooks/useSelectedProviders";
import { useWatchlist } from "@/hooks/useLocalSet";
import { ScoreBreakdown, CombinedScore } from "@/components/ScoreBreakdown";
import { toast } from "sonner";
import type { DiscoverResponse, MovieResult } from "@/lib/types";
import { cn } from "@/lib/cn";

export function SurpriseSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const { selected } = useSelectedProviders();
  const watchlist = useWatchlist();
  const [pick, setPick] = useState<MovieResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPick(null);
    try {
      const params = new URLSearchParams({
        sort: "best",
        rating_min: "7",
        page: String(Math.ceil(Math.random() * 3)),
      });
      if (selected.length) {
        params.set("providers", selected.join(","));
        params.set("only_mine", "true");
      }
      const res = await fetch(`/api/discover?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as DiscoverResponse;
      const top = data.results
        .filter((m) => (m.ratings.combined ?? m.ratings.audience ?? 0) >= 70)
        .slice(0, 50);
      const pool = top.length > 0 ? top : data.results;
      const choice = pool[Math.floor(Math.random() * pool.length)];
      if (!choice) throw new Error("No matches found. Try widening filters.");
      setPick(choice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to roll a pick.");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    let canceled = false;
    if (open && !pick && !loading) {
      Promise.resolve().then(() => {
        if (!canceled) void roll();
      });
    }
    return () => {
      canceled = true;
    };
  }, [open, pick, loading, roll]);

  useEffect(() => {
    let canceled = false;
    if (!open) {
      Promise.resolve().then(() => {
        if (canceled) return;
        setPick(null);
        setError(null);
      });
    }
    return () => {
      canceled = true;
    };
  }, [open]);

  const onWatchlist = pick ? watchlist.values.includes(pick.tmdbId) : false;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                initial={reduce ? false : { opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
                className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] shadow-2xl"
              >
                <Dialog.Title className="sr-only">Surprise pick</Dialog.Title>
                <Dialog.Description className="sr-only">
                  A random highly-rated movie from your services.
                </Dialog.Description>

                <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Dices className="h-4 w-4 text-[var(--color-accent)]" />
                    Tonight&apos;s surprise
                  </span>
                  <Dialog.Close
                    className="rounded-full p-2 text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>

                <div className="relative" aria-live="polite">
                  {loading && (
                    <div className="flex h-64 items-center justify-center text-[var(--color-muted)]">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Spinning the wheel…
                    </div>
                  )}
                  {error && !loading && (
                    <div className="p-6 text-sm text-[var(--color-muted)]">
                      <p>{error}</p>
                      <button
                        type="button"
                        onClick={roll}
                        className="mt-3 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-zinc-900"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                  {pick && !loading && (
                    <motion.div
                      key={pick.tmdbId}
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35 }}
                      className="relative"
                    >
                      <div className="relative aspect-[16/9] w-full overflow-hidden bg-[var(--color-surface)]">
                        {pick.backdropUrl ? (
                          <Image
                            src={pick.backdropUrl}
                            alt=""
                            fill
                            sizes="560px"
                            className="object-cover"
                          />
                        ) : null}
                        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-elevated)] via-[var(--color-bg-elevated)]/50 to-transparent" />
                        <div className="absolute right-3 top-3">
                          <CombinedScore ratings={pick.ratings} size="lg" />
                        </div>
                      </div>
                      <div className="space-y-3 px-5 pb-5 pt-3">
                        <div>
                          <h2 className="font-display text-3xl leading-tight tracking-tight">
                            {pick.title}
                          </h2>
                          <div className="mt-1 text-xs text-[var(--color-muted)]">
                            {pick.year ?? "—"}
                            {pick.runtime ? ` · ${pick.runtime} min` : ""}
                            {pick.genres[0] ? ` · ${pick.genres.slice(0, 2).join(", ")}` : ""}
                          </div>
                        </div>
                        <p className="line-clamp-3 text-sm text-[var(--color-text)]/85">
                          {pick.overview || "No overview available."}
                        </p>
                        <ScoreBreakdown ratings={pick.ratings} />
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/movie/${pick.tmdbId}`}
                              onClick={() => onOpenChange(false)}
                              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-zinc-900 hover:brightness-105"
                            >
                              View details
                            </Link>
                            <button
                              type="button"
                              onClick={() => {
                                const wasOn = watchlist.has(pick.tmdbId);
                                watchlist.toggle(pick.tmdbId);
                                toast.success(wasOn ? "Removed from watchlist" : "Saved to watchlist", { duration: 1200 });
                              }}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium",
                                onWatchlist
                                  ? "border-rose-500 bg-rose-500 text-white"
                                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]",
                              )}
                            >
                              <Heart className="h-4 w-4" fill={onWatchlist ? "currentColor" : "none"} />
                              {onWatchlist ? "Saved" : "Save"}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={roll}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]"
                          >
                            <Dices className="h-4 w-4" />
                            Roll again
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
