"use client";

// StillPair — Q5 / Q14 aesthetic variant. Same A/B mechanics as QuestionCard
// but each option renders as a tall card with a gradient "still" placeholder
// derived from the question's colorHint. Real images can replace later by
// dropping a public asset and swapping the inner element.

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { dur, ease } from "@/lib/motion";

export interface StillOption {
  label: string;
  subtitle?: string;
  still?: { description: string; colorHint: string };
}

export interface StillPairProps {
  prompt: string;
  index: number;
  total: number;
  kindLabel?: string;
  a: StillOption;
  b: StillOption;
  onPick: (choice: "a" | "b") => void;
  onSkip: () => void;
}

// Maps the small vocabulary of colorHint tokens to Tailwind gradient classes.
// Unknown hints fall back to a neutral graphite gradient so we never crash.
function gradientFor(hint: string | undefined): string {
  switch (hint) {
    // Used in current questions.json
    case "warm-saturated":
      return "from-amber-700/45 via-rose-700/35 to-orange-900/40";
    case "cool-desaturated":
      return "from-slate-700/45 via-sky-900/35 to-zinc-800/40";
    case "pastel-symmetric":
      return "from-rose-300/40 via-amber-200/30 to-sky-200/35";
    case "neon-frenetic":
      return "from-fuchsia-600/50 via-rose-700/40 to-cyan-700/35";
    // Reserved tokens for future questions
    case "high-contrast-bw":
      return "from-zinc-100/15 via-zinc-700/30 to-black/70";
    case "soft-pastel":
      return "from-rose-200/30 via-amber-100/25 to-sky-200/30";
    case "neon-night":
      return "from-fuchsia-700/45 via-indigo-800/40 to-cyan-700/30";
    case "earth-natural":
      return "from-stone-700/45 via-emerald-900/30 to-amber-900/40";
    case "noir-shadow":
      return "from-zinc-900/80 via-zinc-800/60 to-amber-900/30";
    case "celluloid-faded":
      return "from-amber-200/20 via-rose-300/15 to-amber-700/30";
    default:
      return "from-[var(--color-surface)] via-[var(--color-surface-2)] to-[var(--color-bg-elevated)]";
  }
}

export function StillPair({
  prompt,
  index,
  total,
  kindLabel = "Aesthetic",
  a,
  b,
  onPick,
  onSkip,
}: StillPairProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: dur.regular, ease: ease.entrance }}
      className="flex w-full max-w-4xl flex-col items-center gap-8"
    >
      <div className="space-y-3 text-center">
        <div className="num-prose flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--color-subtle)]">
          <span>
            Question {index} of {total}
          </span>
          <span aria-hidden>·</span>
          <span className="text-[var(--color-accent)]/80">{kindLabel}</span>
        </div>
        <h2 className="font-display text-balance text-[28px] leading-[1.05] text-[var(--color-text)] sm:text-[38px]">
          {prompt}
        </h2>
      </div>

      <div className="grid w-full gap-4 sm:grid-cols-2">
        <StillCard optionKey="A" option={a} onClick={() => onPick("a")} />
        <StillCard optionKey="B" option={b} onClick={() => onPick("b")} />
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="text-[13px] text-[var(--color-subtle)] underline-offset-4 transition hover:text-[var(--color-muted)] hover:underline"
      >
        Neither moves me
        <span className="ml-2 text-[11px] text-[var(--color-subtle)]/70">(S)</span>
      </button>
    </motion.div>
  );
}

function StillCard({
  optionKey,
  option,
  onClick,
}: {
  optionKey: "A" | "B";
  option: StillOption;
  onClick: () => void;
}) {
  const gradient = gradientFor(option.still?.colorHint);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${option.label}. ${option.still?.description ?? ""}`}
      className={cn(
        "group relative flex aspect-[3/4] w-full flex-col justify-end overflow-hidden rounded-[var(--radius-card)]",
        "border border-[var(--color-border)] text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-0.5 hover:border-[var(--color-accent)]/60 hover:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.95)]",
      )}
    >
      {/* Gradient "still" */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 bg-gradient-to-br transition-transform duration-300 group-hover:scale-[1.03]",
          gradient,
        )}
      />
      {/* Film-grain-ish noise via a soft radial */}
      <span
        aria-hidden
        className="absolute inset-0 mix-blend-overlay opacity-30"
        style={{
          background:
            "radial-gradient(80% 60% at 30% 20%, oklch(0.95 0.04 80 / 0.18) 0%, transparent 70%), radial-gradient(60% 80% at 80% 100%, oklch(0.15 0.05 30 / 0.25) 0%, transparent 70%)",
        }}
      />
      {/* Vignette + bottom fade for caption legibility */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, oklch(0.10 0.018 30 / 0.85) 0%, oklch(0.12 0.02 30 / 0.40) 35%, transparent 70%)",
        }}
      />

      <span className="num-prose absolute right-4 top-4 z-10 text-[10px] uppercase tracking-[0.22em] text-white/80 group-hover:text-[var(--color-accent)]">
        {optionKey}
      </span>

      <span className="relative z-10 flex flex-col gap-1 p-5 sm:p-6">
        <span className="font-display text-[22px] leading-tight text-white sm:text-[26px]">
          {option.label}
        </span>
        {option.subtitle && (
          <span className="text-[13px] text-white/75 sm:text-[14px]">{option.subtitle}</span>
        )}
        {option.still?.description && (
          <span className="num-prose mt-1 text-[11px] uppercase tracking-[0.18em] text-white/55">
            {option.still.description}
          </span>
        )}
      </span>
    </button>
  );
}
