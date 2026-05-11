"use client";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";

interface Props {
  label: string;
  value: number | null; // 0..max
  max?: number; // default 100
  size?: number; // px
  className?: string;
  sublabel?: string;
}

function colorFor(percent: number | null): string {
  if (percent == null) return "var(--color-subtle)";
  if (percent >= 80) return "var(--color-good)";
  if (percent >= 65) return "var(--color-warn)";
  if (percent >= 45) return "var(--color-accent)";
  return "var(--color-bad)";
}

export function RatingDial({
  label,
  value,
  max = 100,
  size = 72,
  className,
  sublabel,
}: Props) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value != null ? Math.max(0, Math.min(1, value / max)) : 0;
  const color = colorFor(value != null ? (value / max) * 100 : null);
  const display =
    value == null ? "—" : max === 10 ? value.toFixed(1) : Math.round(value).toString();

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${label}: ${display}${value == null ? " (no data)" : ` of ${max}`}`}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="oklch(0.32 0.014 270 / 0.6)"
            strokeWidth={4}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - pct) }}
            transition={{ duration: 1, ease: [0.2, 0.7, 0.2, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold tabular-nums">
          {display}
        </div>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-muted)]">
          {label}
        </span>
        {sublabel && (
          <span className="text-[10px] text-[var(--color-subtle)]">{sublabel}</span>
        )}
      </div>
    </div>
  );
}
