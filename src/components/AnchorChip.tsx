"use client";
// Header chip: "Tuned to: {title} ×". Click × to clear the anchor.
// Renders nothing until `useAnchor()` is hydrated AND an anchor exists,
// to avoid an SSR/CSR flash.

import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { useAnchor } from "@/lib/anchor";
import { logEvent } from "@/lib/track";
import { dur, ease } from "@/lib/motion";
import { cn } from "@/lib/cn";

export function AnchorChip({ className }: { className?: string }) {
  const { anchor, clear, hydrated } = useAnchor();

  return (
    <AnimatePresence>
      {hydrated && anchor && (
        <motion.div
          key={anchor.tmdbId}
          initial={{ opacity: 0, y: -4, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.96 }}
          transition={{ duration: dur.quick, ease: ease.standard }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--color-accent)]",
            className,
          )}
          aria-label={`Tuned to ${anchor.title}. Click to clear anchor.`}
        >
          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-accent)]/75">
            Tuned to
          </span>
          <span className="max-w-[14ch] truncate">{anchor.title}</span>
          <button
            type="button"
            onClick={() => {
              logEvent({ k: "anchor_clear", m: anchor.tmdbId, s: "chip" });
              clear();
            }}
            className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--color-accent)]/75 transition hover:bg-[var(--color-accent)]/15 hover:text-[var(--color-accent)]"
            aria-label="Clear anchor"
          >
            <X className="h-3 w-3" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
