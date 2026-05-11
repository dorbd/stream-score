"use client";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { PROVIDERS, providerCatalogLogo, type ProviderDef } from "@/lib/providers";
import { getBrandSwatch } from "@/lib/providerBrands";
import { useSelectedProviders } from "@/hooks/useSelectedProviders";
import { dur, ease, springSnap } from "@/lib/motion";
import { cn } from "@/lib/cn";

export function ProviderSelector({
  variant = "grid",
}: {
  variant?: "grid" | "chips";
}) {
  const { selected, toggle, setSelected, hydrated } = useSelectedProviders();
  const reduce = useReducedMotion();

  const handleToggle = (key: string, name: string) => {
    const wasOn = selected.includes(key);
    toggle(key);
    toast.success(wasOn ? `Removed ${name}` : `Added ${name}`, { duration: 1100 });
  };

  if (variant === "chips") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {PROVIDERS.map((p) => (
          <ProviderChip
            key={p.key}
            provider={p}
            on={hydrated && selected.includes(p.key)}
            onClick={() => handleToggle(p.key, p.name)}
            reduce={!!reduce}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="group" aria-label="Streaming services">
        {PROVIDERS.map((p) => {
          const on = hydrated && selected.includes(p.key);
          return (
            <li key={p.key}>
              <ProviderSurfaceTile
                provider={p}
                on={on}
                onClick={() => handleToggle(p.key, p.name)}
                reduce={!!reduce}
              />
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>
          {hydrated
            ? `${selected.length} ${selected.length === 1 ? "service" : "services"} selected`
            : "Loading your services…"}
        </span>
        {hydrated && selected.length > 0 && (
          <button
            type="button"
            className="rounded-md px-2 py-1 hover:bg-[var(--color-surface)]"
            onClick={() => {
              setSelected([]);
              toast("Cleared all services");
            }}
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

function ProviderSurfaceTile({
  provider,
  on,
  onClick,
  reduce,
}: {
  provider: ProviderDef;
  on: boolean;
  onClick: () => void;
  reduce: boolean;
}) {
  const brand = getBrandSwatch(provider.key);
  const logoUrl = providerCatalogLogo(provider);
  const isFlat = provider.kinds.includes("flatrate");
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={{ duration: dur.quick }}
      aria-pressed={on}
      aria-label={`${provider.name}, ${on ? "selected" : "not selected"}`}
      className={cn(
        "group relative flex h-full w-full items-center gap-3 overflow-hidden rounded-[var(--radius-tile)] p-3 text-left transition",
        on
          ? "border-[var(--color-accent)]"
          : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]",
        "border bg-[var(--color-surface)]/60",
      )}
      style={{
        background: on
          ? `linear-gradient(135deg, var(--color-accent-wash), transparent 60%), var(--color-surface)`
          : undefined,
      }}
    >
      {/* Logo badge with 8% brand wash backdrop */}
      <span
        aria-hidden
        className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-white/5"
        style={{ background: `${brand.bg}1f` }}
      >
        <Image
          src={logoUrl}
          alt=""
          width={48}
          height={48}
          className="h-full w-full object-contain p-1.5"
          unoptimized
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[var(--color-text)]">
          {provider.name}
        </div>
        <div className="rubric mt-0.5" style={{ letterSpacing: "0.18em" }}>
          {isFlat ? "Subscription" : "Rent · Buy"}
        </div>
      </div>
      <AnimatePresence>
        {on && (
          <motion.span
            key="check"
            initial={reduce ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduce ? undefined : { scale: 0.5, opacity: 0 }}
            transition={springSnap}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-bg)]"
            aria-hidden
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function ProviderChip({
  provider,
  on,
  onClick,
  reduce,
}: {
  provider: ProviderDef;
  on: boolean;
  onClick: () => void;
  reduce: boolean;
}) {
  const brand = getBrandSwatch(provider.key);
  const logoUrl = providerCatalogLogo(provider);
  return (
    <motion.button
      type="button"
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={{ duration: dur.quick, ease: ease.entrance }}
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-xs font-medium transition",
        on
          ? "border-[var(--color-accent)] bg-[var(--color-accent-wash)] text-[var(--color-text)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)]/50 text-[var(--color-muted)] hover:border-[var(--color-border-strong)]",
      )}
    >
      <span
        aria-hidden
        className="grid h-5 w-5 place-items-center overflow-hidden rounded-md"
        style={{ background: `${brand.bg}1f` }}
      >
        <Image src={logoUrl} alt="" width={20} height={20} className="h-full w-full object-contain" unoptimized />
      </span>
      {provider.short}
      {on && <Check className="h-3 w-3 text-[var(--color-accent)]" strokeWidth={3} />}
    </motion.button>
  );
}
