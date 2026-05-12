"use client";

// Minimal progress dot row for the DNA quiz. One dot per question.
// Filled = answered, current = ringed, future = ghost. Animates fill on commit.

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

interface ProgressDotsProps {
  total: number;
  /** 0-based index of the current (in-progress) question. */
  current: number;
  /** Number of questions already answered. */
  answered: number;
  className?: string;
}

export function ProgressDots({ total, current, answered, className }: ProgressDotsProps) {
  const reduce = useReducedMotion();
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={answered}
      aria-label={`Question ${Math.min(current + 1, total)} of ${total}`}
      className={cn("flex flex-wrap items-center justify-center gap-1.5", className)}
    >
      {Array.from({ length: total }).map((_, i) => {
        const isAnswered = i < answered;
        const isCurrent = i === current;
        return (
          <motion.span
            key={i}
            initial={false}
            animate={{
              scale: isCurrent ? 1.15 : 1,
              opacity: isAnswered || isCurrent ? 1 : 0.45,
            }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isAnswered
                ? "bg-[var(--color-accent)]"
                : isCurrent
                  ? "bg-[var(--color-accent)]/70 ring-2 ring-[var(--color-accent)]/30"
                  : "bg-[var(--color-border-strong)]",
            )}
            aria-hidden
          />
        );
      })}
    </div>
  );
}
