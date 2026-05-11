import { cn } from "@/lib/cn";

interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** "marquee" renders the unlit-marquee SVG. */
  art?: "marquee" | "none";
}

export function EmptyState({
  title,
  description,
  action,
  className,
  art = "marquee",
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-[var(--radius-hero)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)]/40 px-6 py-16 text-center",
        className,
      )}
    >
      {art === "marquee" && <MarqueeSvg />}
      <div className="space-y-1.5">
        <div className="font-display text-2xl tracking-tight text-[var(--color-text)]">
          {title}
        </div>
        {description && (
          <p className="mx-auto max-w-md text-sm text-[var(--color-muted)]">{description}</p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

function MarqueeSvg() {
  // 12 marquee bulbs forming a wide rounded rectangle frame. One bulb pulses.
  return (
    <svg
      viewBox="0 0 280 90"
      width="280"
      height="90"
      aria-hidden
      className="text-[var(--color-subtle)]"
    >
      <rect
        x="10"
        y="14"
        width="260"
        height="62"
        rx="10"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1"
      />
      <rect
        x="22"
        y="26"
        width="236"
        height="38"
        rx="6"
        fill="oklch(0.16 0.026 28)"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1"
      />
      {/* Top bulbs */}
      {Array.from({ length: 9 }).map((_, i) => (
        <circle
          key={`t${i}`}
          cx={32 + i * 27}
          cy={10}
          r={2.5}
          fill="currentColor"
          fillOpacity={0.45}
          className={i === 4 ? "bulb-pulse" : undefined}
          style={i === 4 ? { color: "var(--color-accent)" } : undefined}
        />
      ))}
      {/* Bottom bulbs */}
      {Array.from({ length: 9 }).map((_, i) => (
        <circle key={`b${i}`} cx={32 + i * 27} cy={82} r={2.5} fill="currentColor" fillOpacity={0.45} />
      ))}
      {/* "NOW SHOWING" rubric inside, dim */}
      <text
        x="140"
        y="50"
        textAnchor="middle"
        fontFamily="ui-serif, Georgia, serif"
        fontStyle="italic"
        fontSize="15"
        fill="currentColor"
        fillOpacity="0.55"
      >
        now showing
      </text>
    </svg>
  );
}
