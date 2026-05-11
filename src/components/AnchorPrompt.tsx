"use client";
// Anchor-picker modal. Shown after the user dismisses the daily pick
// for the first time — invites them to seed a film we should tune to.
//
// UX: free-text input → cmdk popover of TMDb autocomplete results.
// Selecting a result calls `/api/extract-anchor` with the tmdbId,
// stores the returned anchor via `useAnchor`, and closes.
// Skip CTA closes the modal without setting an anchor.

import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { Film, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { useAnchor, type AnchorFingerprint } from "@/lib/anchor";
import { logEvent } from "@/lib/track";
import type { DiscoverResponse, MovieResult } from "@/lib/types";
import { dur, ease } from "@/lib/motion";

interface ExtractAnchorResponse {
  tmdbId: number;
  title: string;
  year: number | null;
  fingerprint: AnchorFingerprint;
}

export function AnchorPrompt({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { setAnchor } = useAnchor();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [picking, setPicking] = useState(false);
  const reqIdRef = useRef(0);

  // Reset state when the modal closes.
  useEffect(() => {
    if (open) return;
    let canceled = false;
    Promise.resolve().then(() => {
      if (canceled) return;
      setQuery("");
      setResults([]);
      setLoadingSearch(false);
      setPicking(false);
    });
    return () => {
      canceled = true;
    };
  }, [open]);

  // Debounced search.
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    let canceled = false;
    if (!trimmed) {
      Promise.resolve().then(() => {
        if (canceled) return;
        setResults([]);
        setLoadingSearch(false);
      });
      return () => {
        canceled = true;
      };
    }
    const myReq = ++reqIdRef.current;
    const t = setTimeout(() => {
      Promise.resolve().then(() => {
        if (!canceled && myReq === reqIdRef.current) setLoadingSearch(true);
      });
      fetch(`/api/discover?q=${encodeURIComponent(trimmed)}&page=1`)
        .then((r) => r.json() as Promise<DiscoverResponse>)
        .then((d) => {
          if (canceled || myReq !== reqIdRef.current) return;
          setResults(d.results?.slice(0, 6) ?? []);
        })
        .catch(() => {})
        .finally(() => {
          if (!canceled && myReq === reqIdRef.current) setLoadingSearch(false);
        });
    }, 220);
    return () => {
      canceled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  const choose = async (movie: MovieResult) => {
    if (picking) return;
    setPicking(true);
    try {
      const res = await fetch("/api/extract-anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: movie.tmdbId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed: ${res.status}`);
      }
      const data = (await res.json()) as ExtractAnchorResponse;
      setAnchor({
        tmdbId: data.tmdbId,
        title: data.title,
        year: data.year,
        fingerprint: data.fingerprint,
      });
      logEvent({ k: "anchor_set", m: data.tmdbId, s: "prompt" });
      toast.success(`Tuned to ${data.title}`, { duration: 1600 });
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't set anchor.";
      toast.error(msg);
    } finally {
      setPicking(false);
    }
  };

  const skip = () => {
    logEvent({ k: "anchor_clear", s: "prompt-skip" });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: dur.quick }}
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: dur.regular, ease: ease.entrance }}
                className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] shadow-2xl"
              >
                <div className="border-b border-[var(--color-border)] px-5 pb-3 pt-5">
                  <div className="flex items-center gap-2 text-[var(--color-accent)]">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-[11px] uppercase tracking-[0.18em]">
                      Tune the picks
                    </span>
                  </div>
                  <Dialog.Title className="mt-1.5 text-xl font-semibold text-[var(--color-text)]">
                    Name one film we should anchor on.
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-[var(--color-muted)]">
                    Anything you genuinely loved — we&apos;ll bend tonight&apos;s rail
                    toward films that share its texture.
                  </Dialog.Description>
                </div>

                <Command shouldFilter={false} className="flex flex-col">
                  <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5">
                    {loadingSearch || picking ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
                    ) : (
                      <Search className="h-4 w-4 text-[var(--color-muted)]" />
                    )}
                    <Command.Input
                      autoFocus
                      value={query}
                      onValueChange={setQuery}
                      placeholder="e.g. Past Lives, Phantom Thread, Burning…"
                      className="w-full bg-transparent py-3.5 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-subtle)] focus:outline-none"
                    />
                  </div>
                  <Command.List className="max-h-[50vh] overflow-y-auto p-2">
                    {!query.trim() && (
                      <div className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
                        Start typing a film name.
                      </div>
                    )}
                    {query.trim() && !loadingSearch && results.length === 0 && (
                      <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
                        No matches for &ldquo;{query}&rdquo;.
                      </Command.Empty>
                    )}
                    {results.map((r) => (
                      <Command.Item
                        key={r.tmdbId}
                        value={`${r.tmdbId}-${r.title}`}
                        onSelect={() => choose(r)}
                        disabled={picking}
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-[var(--color-text)] aria-selected:bg-[var(--color-surface)] data-[disabled]:opacity-50"
                      >
                        <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-[var(--color-surface)]">
                          {r.posterUrl ? (
                            <Image
                              src={r.posterUrl}
                              alt=""
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          ) : (
                            <Film className="absolute inset-0 m-auto h-4 w-4 text-[var(--color-subtle)]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{r.title}</div>
                          <div className="truncate text-xs text-[var(--color-muted)]">
                            {r.year ?? "—"}
                            {r.runtime ? ` · ${r.runtime} min` : ""}
                            {r.genres[0] ? ` · ${r.genres.slice(0, 2).join(", ")}` : ""}
                          </div>
                        </div>
                      </Command.Item>
                    ))}
                  </Command.List>
                </Command>

                <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg)]/40 px-5 py-3">
                  <button
                    type="button"
                    onClick={skip}
                    className="text-[13px] text-[var(--color-muted)] underline-offset-2 transition hover:text-[var(--color-text)] hover:underline"
                  >
                    Skip — let you guess
                  </button>
                  <kbd className="hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-subtle)] sm:inline">
                    esc
                  </kbd>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
