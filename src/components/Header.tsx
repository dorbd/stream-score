"use client";
import Link from "next/link";
import { Settings, Search, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { CommandPalette } from "./CommandPalette";
import { SurpriseSheet } from "./SurpriseSheet";
import { AnchorChip } from "./AnchorChip";

export function Header() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [surpriseOpen, setSurpriseOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/75 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link href="/" className="group inline-flex items-center" aria-label="stream-score home">
            <span className="font-display text-[26px] leading-none tracking-[-0.01em] text-[var(--color-text)]">
              stream
            </span>
            <span className="font-display text-[26px] italic leading-none tracking-[-0.01em] text-[var(--color-accent)]">
              score
            </span>
          </Link>
          <AnchorChip className="hidden sm:inline-flex" />
          <nav className="flex items-center gap-1.5" aria-label="Primary">
            <button
              type="button"
              onClick={() => setSurpriseOpen(true)}
              className="group inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-2.5 py-2 text-sm font-medium text-[var(--color-accent)] transition hover:bg-[var(--color-accent)] hover:text-zinc-900"
              aria-label="Surprise me with a random movie"
            >
              <Shuffle className="h-4 w-4" />
              <span className="hidden sm:inline">Surprise me</span>
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="group inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-2 text-sm text-[var(--color-muted)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
              aria-label="Search movies (Cmd or Ctrl + K)"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search…</span>
              <kbd className="hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-subtle)] sm:inline" aria-hidden>
                ⌘K
              </kbd>
            </button>
            <Link
              href="/settings"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
              aria-label="Manage services"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Services</span>
            </Link>
          </nav>
        </div>
      </header>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <SurpriseSheet open={surpriseOpen} onOpenChange={setSurpriseOpen} />
    </>
  );
}
