"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, Info, Check } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useSelectedProviders } from "@/hooks/useSelectedProviders";
import { dur, ease } from "@/lib/motion";
import { cn } from "@/lib/cn";
import type { MovieResult, ProviderTag } from "@/lib/types";

type Action = "stream" | "rent" | "buy" | "free" | "ads";

export function MovieDetailClient({ initialResult }: { initialResult: MovieResult }) {
  const { selected, hydrated } = useSelectedProviders();
  const reduce = useReducedMotion();
  const [override, setOverride] = useState<{ key: string; data: MovieResult } | null>(null);
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

  const yoursFlat = allFlat.filter((p) => mineKeys.has(p.key));
  const othersFlat = allFlat.filter((p) => !mineKeys.has(p.key));
  const haveAnyData =
    allFlat.length + allRent.length + allBuy.length + allFree.length + allAds.length > 0;

  return (
    <section className="space-y-6 rounded-[var(--radius-hero)] border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-2xl tracking-tight">Where to watch</h2>
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

      {/* PROMINENT: on your services */}
      {hydrated && selected.length > 0 && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur.regular, ease: ease.entrance }}
          className={cn(
            "overflow-hidden rounded-2xl border",
            yoursFlat.length > 0
              ? "border-[var(--color-accent)]/40 bg-[var(--color-accent-wash)]"
              : "border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
          )}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 text-xs">
            <span
              className="rubric"
              style={{
                color: yoursFlat.length > 0 ? "var(--color-accent)" : "var(--color-subtle)",
              }}
            >
              {yoursFlat.length > 0 ? "✓ On your services" : "Not on your services"}
            </span>
          </div>
          {yoursFlat.length > 0 ? (
            <ul className="divide-y divide-[var(--color-border)]">
              {yoursFlat.map((p) => (
                <WatchRow key={p.id} provider={p} action="stream" included href={link} reduce={!!reduce} />
              ))}
            </ul>
          ) : (
            <div className="px-4 pb-3 text-sm text-[var(--color-muted)]">
              This isn&apos;t included on{" "}
              <span className="text-[var(--color-text)]">
                {selected.length} {selected.length === 1 ? "service" : "services"}
              </span>
              .{" "}
              <Link href="/settings" className="underline-offset-4 hover:underline">
                Update services
              </Link>{" "}
              or check rent/buy below.
            </div>
          )}
        </motion.div>
      )}

      {othersFlat.length > 0 && (
        <Group title="Streaming">
          <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            {othersFlat.map((p) => (
              <WatchRow key={p.id} provider={p} action="stream" href={link} reduce={!!reduce} />
            ))}
          </ul>
        </Group>
      )}

      {allFree.length > 0 && (
        <Group title="Free">
          <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            {allFree.map((p) => (
              <WatchRow key={p.id} provider={p} action="free" href={link} reduce={!!reduce} />
            ))}
          </ul>
        </Group>
      )}
      {allAds.length > 0 && (
        <Group title="Free with ads">
          <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            {allAds.map((p) => (
              <WatchRow key={p.id} provider={p} action="ads" href={link} reduce={!!reduce} />
            ))}
          </ul>
        </Group>
      )}

      {allRent.length > 0 && (
        <Group title="Rent">
          <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            {allRent.map((p) => (
              <WatchRow key={p.id} provider={p} action="rent" href={link} reduce={!!reduce} />
            ))}
          </ul>
        </Group>
      )}
      {allBuy.length > 0 && (
        <Group title="Buy">
          <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            {allBuy.map((p) => (
              <WatchRow key={p.id} provider={p} action="buy" href={link} reduce={!!reduce} />
            ))}
          </ul>
        </Group>
      )}

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

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="rubric flex items-center justify-between" style={{ letterSpacing: "0.22em" }}>
        <span>{title}</span>
      </div>
      <AnimatePresence>{children}</AnimatePresence>
    </div>
  );
}

function actionLabel(action: Action): string {
  if (action === "stream") return "Stream";
  if (action === "rent") return "Rent";
  if (action === "buy") return "Buy";
  if (action === "free") return "Free";
  return "Free with ads";
}

function WatchRow({
  provider,
  action,
  included = false,
  href,
  reduce,
}: {
  provider: ProviderTag;
  action: Action;
  included?: boolean;
  href: string | null;
  reduce: boolean;
}) {
  const inner = (
    <>
      <span
        aria-hidden
        className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg ring-1 ring-white/5"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        {provider.logoUrl ? (
          <Image src={provider.logoUrl} alt="" width={40} height={40} className="h-full w-full object-contain p-1" />
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-white/60">
            {provider.name.slice(0, 3)}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--color-text)]">{provider.name}</div>
        <div className="text-[11px] text-[var(--color-muted)]">
          {included ? (
            <span className="inline-flex items-center gap-1 text-[var(--color-accent)]">
              <Check className="h-3 w-3" strokeWidth={3} /> Included with your subscription
            </span>
          ) : (
            actionLabel(action)
          )}
        </div>
      </div>
      <ExternalLink className="h-4 w-4 text-[var(--color-subtle)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-text)]" />
    </>
  );
  const baseClass = "group flex items-center gap-3 px-3 py-2.5 transition";
  if (href) {
    return (
      <motion.li
        layout
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={cn(baseClass, "hover:bg-[var(--color-surface)]")}
          title={`Open ${provider.name}`}
        >
          {inner}
        </a>
      </motion.li>
    );
  }
  return (
    <li className={baseClass}>{inner}</li>
  );
}
