"use client";

// DimChart — 7-axis bar viz for the reveal page.
// Each axis is a horizontal bar centered at 0. Negative values fill leftward,
// positive rightward. Values are expected in [-1, 1]. Anything outside is clamped.

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

export interface DimChartProps {
  vector: number[];
  className?: string;
}

// Pole labels per the DNA spec (7 dimensions, in order).
// Index → [leftPole, rightPole]. If Agent 1's loadings.json uses different names,
// re-export them; meanwhile these are the canonical Forum-Chair-ruling poles.
const POLES: Array<{ left: string; right: string }> = [
  { left: "Popcorn", right: "Prestige" },
  { left: "Familiar", right: "Strange" },
  { left: "Plot-driven", right: "Mood-driven" },
  { left: "Bright", right: "Bleak" },
  { left: "Sincere", right: "Ironic" },
  { left: "Restrained", right: "Maximal" },
  { left: "Modern", right: "Classic" },
];

function clamp(v: number, min = -1, max = 1) {
  return Math.max(min, Math.min(max, v));
}

export function DimChart({ vector, className }: DimChartProps) {
  const reduce = useReducedMotion();
  const safe = (vector ?? []).slice(0, POLES.length);
  // Pad with zeros if input is short.
  while (safe.length < POLES.length) safe.push(0);

  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/70 p-4 sm:p-6",
        className,
      )}
      role="img"
      aria-label="Your taste dimensions, 7-axis chart"
    >
      <div className="num-prose mb-4 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-[var(--color-subtle)]">
        <span>Your axes</span>
        <span>−1 ←→ +1</span>
      </div>
      <ul className="flex flex-col gap-4">
        {POLES.map((pole, i) => {
          const raw = clamp(safe[i] ?? 0);
          const pct = Math.abs(raw) * 50; // half-bar width percentage
          const isRight = raw >= 0;
          return (
            <li key={pole.left} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span
                  className={cn(
                    "transition-colors",
                    !isRight
                      ? "font-medium text-[var(--color-text)]"
                      : "text-[var(--color-subtle)]",
                  )}
                >
                  {pole.left}
                </span>
                <span
                  className={cn(
                    "transition-colors",
                    isRight ? "font-medium text-[var(--color-text)]" : "text-[var(--color-subtle)]",
                  )}
                >
                  {pole.right}
                </span>
              </div>
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface)]/60">
                {/* Center tick */}
                <span
                  aria-hidden
                  className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[var(--color-border-strong)]"
                />
                {/* Fill */}
                <motion.span
                  aria-hidden
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{
                    duration: reduce ? 0 : 0.6,
                    delay: reduce ? 0 : 0.08 * i,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="absolute top-0 h-full rounded-full bg-[var(--color-accent)]"
                  style={
                    isRight
                      ? { left: "50%" }
                      : { right: "50%" }
                  }
                />
              </div>
              <div className="num-data text-[10px] text-[var(--color-subtle)]">
                {raw > 0 ? "+" : ""}
                {raw.toFixed(2)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
