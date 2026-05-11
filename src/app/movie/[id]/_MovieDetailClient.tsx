"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useSelectedProviders } from "@/hooks/useSelectedProviders";
import { ProviderTile } from "@/components/ProviderTile";
import type { MovieResult, ProviderTag } from "@/lib/types";

type Action = "stream" | "rent" | "buy" | "free" | "ads";

export function MovieDetailClient({ initialResult }: { initialResult: MovieResult }) {
  const { selected, hydrated } = useSelectedProviders();
  const [override, setOverride] = useState<{ key: string; data: MovieResult } | null>(
    null,
  );
  const selectedKey = selected.join(",");

  useEffect(() => {
    if (!hydrated || !selected.length) return;
    let canceled = false;
    const params = new URLSearchParams({ providers: selectedKey });
    fetch(`/api/movie/${initialResult.tmdbId}?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (canceled) return;
        if (data?.result) setOverride({ key: selectedKey, data: data.result });
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [selectedKey, hydrated, selected.length, initialResult.tmdbId]);

  const result =
    override && override.key === selectedKey ? override.data : initialResult;
  const mineKeys = new Set(selected);

  const allFlat = result.availability.flatrate;
  const allRent = result.availability.rent;
  const allBuy = result.availability.buy;
  const allFree = result.availability.free;
  const allAds = result.availability.ads;
  const link = result.availability.link;

  const userMatches = allFlat.filter((p) => mineKeys.has(p.key));
  const haveAnyData =
    allFlat.length + allRent.length + allBuy.length + allFree.length + allAds.length > 0;

  return (
    <section className="space-y-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Where to watch</h2>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            JustWatch <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {hydrated && selected.length > 0 && (
        <UserMatchBanner movie={result} matches={userMatches} />
      )}

      <ProviderRow
        title="Stream (subscription)"
        items={allFlat}
        action="stream"
        emptyLabel="Not on any flat-rate streaming service in this region."
        mineKeys={mineKeys}
        link={link}
      />
      {allFree.length > 0 && (
        <ProviderRow title="Free" items={allFree} action="free" mineKeys={mineKeys} link={link} />
      )}
      {allAds.length > 0 && (
        <ProviderRow title="Free with ads" items={allAds} action="ads" mineKeys={mineKeys} link={link} />
      )}
      <ProviderRow
        title="Rent"
        items={allRent}
        action="rent"
        emptyLabel="No rental options listed by TMDb."
        mineKeys={mineKeys}
        link={link}
      />
      <ProviderRow
        title="Buy"
        items={allBuy}
        action="buy"
        emptyLabel="No purchase options listed by TMDb."
        mineKeys={mineKeys}
        link={link}
      />

      {!haveAnyData && (
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
          <div className="space-y-1.5 text-sm">
            <div className="font-medium">No US availability data from TMDb.</div>
            <p className="text-[var(--color-muted)]">
              TMDb doesn&apos;t list any streaming, rental, or purchase options
              for this title right now. JustWatch may have more — it&apos;s
              often the canonical source.
            </p>
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
              >
                Check on JustWatch <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function UserMatchBanner({
  movie,
  matches,
}: {
  movie: MovieResult;
  matches: ProviderTag[];
}) {
  if (matches.length > 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-2xl border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-3 text-sm"
      >
        <span className="font-semibold text-[var(--color-accent)]">
          ✓ Included on{" "}
          {matches.map((m) => m.name).join(", ")}
        </span>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 text-sm text-[var(--color-muted)]"
    >
      Not on your streaming services.{" "}
      <Link href="/settings" className="text-[var(--color-text)] underline-offset-4 hover:underline">
        Update services →
      </Link>{" "}
      or check rent/buy below.
      <span className="ml-1 text-[var(--color-subtle)]">
        ({movie.title})
      </span>
    </motion.div>
  );
}

function ProviderRow({
  title,
  items,
  action,
  emptyLabel,
  mineKeys,
  link,
}: {
  title: string;
  items: ProviderTag[];
  action: Action;
  emptyLabel?: string;
  mineKeys: Set<string>;
  link: string | null;
}) {
  if (items.length === 0 && !emptyLabel) return null;
  const sorted = [...items].sort((a, b) => {
    const am = mineKeys.has(a.key) ? 1 : 0;
    const bm = mineKeys.has(b.key) ? 1 : 0;
    if (am !== bm) return bm - am;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        <span>{title}</span>
        <span className="font-mono text-[10px] text-[var(--color-subtle)]">
          {items.length || 0}
        </span>
      </div>
      <AnimatePresence mode="popLayout">
        {sorted.length > 0 ? (
          <motion.div
            key="tiles"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6"
          >
            {sorted.map((p) => (
              <motion.div
                key={p.id}
                layout
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <ProviderTile
                  provider={p}
                  action={action}
                  included={action === "stream" && mineKeys.has(p.key)}
                  href={link}
                />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <p className="text-sm text-[var(--color-subtle)]">{emptyLabel}</p>
        )}
      </AnimatePresence>
    </div>
  );
}
