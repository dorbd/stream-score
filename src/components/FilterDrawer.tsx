"use client";
import { Drawer } from "vaul";
import { SlidersHorizontal, X } from "lucide-react";
import { MovieFilters } from "./MovieFilters";
import type { FilterValues } from "./MovieFilters";
import type { TmdbGenre } from "@/lib/types";

export function FilterDrawer({
  value,
  onChange,
  genres,
  activeCount = 0,
}: {
  value: FilterValues;
  onChange: (v: FilterValues) => void;
  genres: TmdbGenre[];
  activeCount?: number;
}) {
  return (
    <Drawer.Root>
      <Drawer.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-border-strong)]"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-zinc-900">
              {activeCount}
            </span>
          )}
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[88vh] flex-col rounded-t-3xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] outline-none">
          <div className="mx-auto mb-2 mt-3 h-1.5 w-12 shrink-0 rounded-full bg-[var(--color-surface-2)]" />
          <div className="flex items-center justify-between px-5 pb-2">
            <Drawer.Title className="text-base font-semibold">
              Filters
            </Drawer.Title>
            <Drawer.Close className="rounded-full p-2 text-[var(--color-muted)] hover:bg-[var(--color-surface)]">
              <X className="h-4 w-4" />
            </Drawer.Close>
          </div>
          <Drawer.Description className="sr-only">
            Filter results by genre, year, runtime, language, and rating.
          </Drawer.Description>
          <div className="flex-1 overflow-y-auto px-5 pb-8">
            <MovieFilters value={value} onChange={onChange} genres={genres} hideSearch />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
