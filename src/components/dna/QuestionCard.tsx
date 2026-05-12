"use client";

// QuestionCard — the A/B forced-choice card with an escape hatch.
// Two big tap targets, keyboard-bindable (A / B / S keys handled by the
// parent runner so cards stay presentational). When an option carries a
// `posterUrl`, the card renders in poster mode (2:3 image above caption);
// otherwise it falls back to the text-only treatment.

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { dur, ease } from "@/lib/motion";

export interface QuestionOption {
  label: string;
  subtitle?: string;
  posterUrl?: string;
  dominantColor?: string;
}

export interface QuestionCardProps {
  prompt: string;
  /** Number to show in the eyebrow, e.g. "Question 3 of 21". */
  index: number;
  total: number;
  /** Optional kind label (e.g. "Aesthetic") shown next to the count. */
  kindLabel?: string;
  a: QuestionOption;
  b: QuestionOption;
  onPick: (choice: "a" | "b") => void;
  onSkip: () => void;
  /** Custom skip text for the small link. Defaults to "Haven't seen / don't know". */
  skipLabel?: string;
}

export function QuestionCard({
  prompt,
  index,
  total,
  kindLabel,
  a,
  b,
  onPick,
  onSkip,
  skipLabel = "Haven't seen / don't know",
}: QuestionCardProps) {
  const reduce = useReducedMotion();
  // If *either* option carries a posterUrl, render both in poster mode so the
  // pair stays visually balanced.
  const posterMode = Boolean(a.posterUrl || b.posterUrl);
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: dur.regular, ease: ease.entrance }}
      className="flex w-full max-w-3xl flex-col items-center gap-8"
    >
      <div className="space-y-3 text-center">
        <div className="num-prose flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--color-subtle)]">
          <span>
            Question {index} of {total}
          </span>
          {kindLabel && (
            <>
              <span aria-hidden>·</span>
              <span className="text-[var(--color-accent)]/80">{kindLabel}</span>
            </>
          )}
        </div>
        <h2 className="font-display text-balance text-[28px] leading-[1.05] text-[var(--color-text)] sm:text-[40px]">
          {prompt}
        </h2>
      </div>

      <div className="grid w-full gap-3 sm:grid-cols-2 sm:gap-4">
        {posterMode ? (
          <>
            <PosterChoiceButton optionKey="A" option={a} onClick={() => onPick("a")} />
            <PosterChoiceButton optionKey="B" option={b} onClick={() => onPick("b")} />
          </>
        ) : (
          <>
            <ChoiceButton optionKey="A" option={a} onClick={() => onPick("a")} />
            <ChoiceButton optionKey="B" option={b} onClick={() => onPick("b")} />
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="text-[13px] text-[var(--color-subtle)] underline-offset-4 transition hover:text-[var(--color-muted)] hover:underline"
      >
        {skipLabel}
        <span className="ml-2 text-[11px] text-[var(--color-subtle)]/70">(S)</span>
      </button>
    </motion.div>
  );
}

function ChoiceButton({
  optionKey,
  option,
  onClick,
}: {
  optionKey: "A" | "B";
  option: QuestionOption;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex min-h-[120px] flex-col items-start gap-2 overflow-hidden rounded-[var(--radius-card)]",
        "border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/80 p-5 text-left sm:min-h-[180px] sm:p-6",
        "transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-0.5 hover:border-[var(--color-accent)]/60 hover:bg-[var(--color-surface)]/90",
        "hover:shadow-[0_18px_50px_-30px_rgba(0,0,0,0.85)]",
        "focus-visible:border-[var(--color-accent)] focus-visible:bg-[var(--color-surface)]",
      )}
    >
      <span className="num-prose absolute right-4 top-4 text-[10px] uppercase tracking-[0.22em] text-[var(--color-subtle)] group-hover:text-[var(--color-accent)]">
        {optionKey}
      </span>
      <span className="font-display block text-[22px] leading-tight text-[var(--color-text)] sm:text-[26px]">
        {option.label}
      </span>
      {option.subtitle && (
        <span className="block text-[13px] text-[var(--color-muted)] sm:text-[14px]">
          {option.subtitle}
        </span>
      )}
      {/* Subtle amber wash on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(60% 80% at 30% 20%, var(--color-accent-wash) 0%, transparent 70%)",
        }}
      />
    </button>
  );
}

function PosterChoiceButton({
  optionKey,
  option,
  onClick,
}: {
  optionKey: "A" | "B";
  option: QuestionOption;
  onClick: () => void;
}) {
  const { posterUrl, dominantColor, label, subtitle } = option;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center gap-3 overflow-hidden rounded-[var(--radius-card)]",
        "border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/80 p-4 text-center sm:p-5",
        "transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:-translate-y-0.5 hover:border-[var(--color-accent)]/60 hover:bg-[var(--color-surface)]/90",
        "hover:shadow-[0_18px_50px_-30px_rgba(0,0,0,0.85)]",
        "focus-visible:border-[var(--color-accent)] focus-visible:bg-[var(--color-surface)]",
      )}
    >
      <span className="num-prose absolute right-4 top-4 z-10 text-[10px] uppercase tracking-[0.22em] text-[var(--color-subtle)] group-hover:text-[var(--color-accent)]">
        {optionKey}
      </span>
      <div
        className="relative aspect-[2/3] w-full max-w-[180px] overflow-hidden rounded-2xl ring-1 ring-black/20 transition group-hover:ring-[var(--color-accent)]/40"
        style={{ background: dominantColor ?? "#1a1a1a" }}
      >
        {posterUrl && (
          <Image
            src={posterUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, 180px"
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        )}
      </div>
      <div className="space-y-0.5 text-center">
        <p className="font-display text-[18px] leading-tight text-[var(--color-text)] sm:text-[20px]">
          {label}
        </p>
        {subtitle && (
          <p className="text-[12px] text-[var(--color-muted)] sm:text-[13px]">
            {subtitle}
          </p>
        )}
      </div>
      {/* Subtle amber wash on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(60% 80% at 30% 20%, var(--color-accent-wash) 0%, transparent 70%)",
        }}
      />
    </button>
  );
}
