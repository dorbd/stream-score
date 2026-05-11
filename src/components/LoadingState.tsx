export function LoadingGrid({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40"
        >
          <div className="aspect-[2/3] w-full shimmer" />
          <div className="space-y-2 p-2.5">
            <div className="h-3.5 w-3/4 rounded shimmer" />
            <div className="h-2.5 w-1/2 rounded shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingInline({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent)]" />
      {label}
    </div>
  );
}
