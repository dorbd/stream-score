"use client";

// DnaBanner — persistent banner at the top of the home For-You view when
// stored DNA is present. Shows the archetype name and the anchor film,
// plus a [Retake] chip that routes to /dna.

import Link from "next/link";
import { RefreshCcw, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import archetypesData from "../../../data/dna/archetypes.json";
import { useAnchor } from "@/lib/anchor";
import { useStoredDna } from "@/lib/dna/storage";
import { dur, ease } from "@/lib/motion";
import { cn } from "@/lib/cn";

interface ArchetypeRow {
  key: string;
  name: string;
  anchorFilm: { title: string; tmdbId: number; year: number };
}

const ARCHETYPE_BY_KEY = new Map<string, ArchetypeRow>(
  (archetypesData as unknown as ArchetypeRow[]).map((a) => [a.key, a]),
);

export function DnaBanner({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const { dna, hydrated } = useStoredDna();
  const { anchor } = useAnchor();

  if (!hydrated || !dna) return null;

  const arch = ARCHETYPE_BY_KEY.get(dna.archetype);
  const archetypeName = arch?.name ?? "Your DNA";
  const anchorTitle = anchor?.title ?? arch?.anchorFilm.title ?? null;

  return (
    <motion.aside
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.regular, ease: ease.entrance }}
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-accent)]/30",
        "bg-[linear-gradient(110deg,var(--color-accent-wash),transparent_60%)] backdrop-blur",
        className,
      )}
      aria-label="Your DNA is active"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <p className="min-w-0 truncate text-[13px] text-[var(--color-text)] sm:text-[14px]">
            <span className="num-prose mr-2 uppercase tracking-[0.18em] text-[var(--color-subtle)]">
              Picked for you
            </span>
            <span aria-hidden className="text-[var(--color-subtle)]">·</span>{" "}
            <Link
              href={`/dna/${dna.archetype}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {archetypeName}
            </Link>
            {anchorTitle && (
              <>
                {" "}
                <span aria-hidden className="text-[var(--color-subtle)]">·</span>{" "}
                <span className="text-[var(--color-muted)]">
                  {anchorTitle} vibes
                </span>
              </>
            )}
          </p>
        </div>
        <Link
          href="/dna"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-1 text-[12px] text-[var(--color-muted)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
          aria-label="Retake the DNA test"
        >
          <RefreshCcw className="h-3 w-3" aria-hidden />
          Retake
        </Link>
      </div>
    </motion.aside>
  );
}
