import { cn } from "@/lib/cn";

interface Props {
  label: string;
  value: number | null;
  max: number;
  className?: string;
  size?: "sm" | "md";
}

function toneFor(percent: number | null): string {
  if (percent == null) return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
  if (percent >= 80) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
  if (percent >= 60) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  if (percent >= 40) return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200";
  return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";
}

export function RatingBadge({ label, value, max, className, size = "md" }: Props) {
  const percent = value != null ? (value / max) * 100 : null;
  const display =
    value == null
      ? "N/A"
      : max === 10
        ? value.toFixed(1)
        : Math.round(value).toString();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium tabular-nums",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        toneFor(percent),
        className,
      )}
      title={`${label}: ${display}${value == null ? "" : ` / ${max}`}`}
    >
      <span className="opacity-70">{label}</span>
      <span>{display}</span>
    </span>
  );
}
