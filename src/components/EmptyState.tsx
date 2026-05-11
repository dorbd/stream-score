import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/30 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="text-base font-semibold text-[var(--color-text)]">{title}</div>
      {description && (
        <p className="max-w-md text-sm text-[var(--color-muted)]">{description}</p>
      )}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
