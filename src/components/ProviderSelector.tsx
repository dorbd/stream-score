"use client";
import { motion, AnimatePresence } from "motion/react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { PROVIDERS } from "@/lib/providers";
import { getBrandSwatch } from "@/lib/providerBrands";
import { useSelectedProviders } from "@/hooks/useSelectedProviders";
import { cn } from "@/lib/cn";

export function ProviderSelector({
  variant = "grid",
}: {
  variant?: "grid" | "chips";
}) {
  const { selected, toggle, setSelected, hydrated } = useSelectedProviders();

  const handleToggle = (key: string, name: string) => {
    const wasOn = selected.includes(key);
    toggle(key);
    toast.success(wasOn ? `Removed ${name}` : `Added ${name}`, { duration: 1400 });
  };

  if (variant === "chips") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {PROVIDERS.map((p) => {
          const on = hydrated && selected.includes(p.key);
          const brand = getBrandSwatch(p.key);
          return (
            <motion.button
              key={p.key}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => handleToggle(p.key, p.name)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                on
                  ? "border-transparent text-white"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]/50 text-[var(--color-muted)] hover:border-[var(--color-border-strong)]",
              )}
              style={on ? { background: brand.bg } : undefined}
              aria-pressed={on}
            >
              {on && <Check className="h-3 w-3" strokeWidth={3} />}
              {p.short}
            </motion.button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {PROVIDERS.map((p) => {
          const on = hydrated && selected.includes(p.key);
          const brand = getBrandSwatch(p.key);
          const fgClass = brand.fg === "light" ? "text-white" : "text-zinc-900";
          return (
            <motion.button
              key={p.key}
              type="button"
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.15 }}
              onClick={() => handleToggle(p.key, p.name)}
              className="group relative flex aspect-[4/3] flex-col items-center justify-center overflow-hidden rounded-2xl text-center"
              style={{
                background: brand.bg,
                boxShadow: on
                  ? `0 0 0 3px var(--color-accent), 0 20px 40px -10px ${brand.glow ?? brand.bg}`
                  : "0 1px 0 0 oklch(0.32 0.014 270 / 0.5) inset",
              }}
              aria-pressed={on}
            >
              <AnimatePresence>
                {on && (
                  <motion.span
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 22 }}
                    className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-zinc-900"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </motion.span>
                )}
              </AnimatePresence>
              <span className={cn("px-2 text-base font-bold leading-tight", fgClass)}>
                {p.short}
              </span>
              <span className={cn("mt-1 text-[10px] uppercase tracking-wider opacity-70", fgClass)}>
                {p.kinds[0] === "flatrate" ? "Subscription" : p.kinds.includes("rent") ? "Rent / Buy" : p.kinds.join(", ")}
              </span>
            </motion.button>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>
          {hydrated
            ? `${selected.length} selected`
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
