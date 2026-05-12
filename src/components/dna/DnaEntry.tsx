"use client";

// DnaEntry — small full-width banner shown on the home page when the user
// has no stored DNA. Dismissible per-session via sessionStorage.
//
// Implementation note: we use `useSyncExternalStore` so initial render is
// hydration-safe (server snapshot = "dismissed", client snapshot reads real
// sessionStorage). This avoids `setState` in an effect, which the project's
// eslint config flags as an error.

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { dur, ease } from "@/lib/motion";

const DISMISS_KEY = "stream-score:dna-entry-dismissed";
const EVENT = "stream-score:dna-entry-changed";

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): "dismissed" | "visible" {
  if (typeof window === "undefined") return "dismissed";
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1" ? "dismissed" : "visible";
  } catch {
    return "visible";
  }
}

function getServerSnapshot(): "dismissed" | "visible" {
  return "dismissed"; // SSR: hide to avoid flash. Real value resolves after hydration.
}

function dismiss() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // ignore — banner will re-appear next page load
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT));
  }
}

export interface DnaEntryProps {
  className?: string;
  /** If true, hide the banner entirely (parent decides on stored DNA). */
  hidden?: boolean;
}

export function DnaEntry({ className, hidden }: DnaEntryProps) {
  const reduce = useReducedMotion();
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (hidden || state === "dismissed") return null;

  return (
    <motion.aside
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.regular, ease: ease.entrance }}
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-accent)]/30",
        "bg-[linear-gradient(110deg,var(--color-accent-wash),transparent_60%)] backdrop-blur",
        className,
      )}
      aria-label="Take the stream-score DNA test"
    >
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] text-[var(--color-text)] sm:text-[15px]">
              <span className="font-medium">Spend 90 seconds.</span>{" "}
              <span className="text-[var(--color-muted)]">
                Get a feed that actually knows you.
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            href="/dna"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-[13px] font-medium text-black/90 transition hover:brightness-110"
          >
            <span className="hidden sm:inline">Take the DNA test</span>
            <span className="sm:hidden">DNA test</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-subtle)] transition hover:bg-[var(--color-surface)]/60 hover:text-[var(--color-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
