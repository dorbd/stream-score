"use client";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PROVIDERS } from "@/lib/providers";
import { getBrandSwatch } from "@/lib/providerBrands";
import { useSelectedProviders } from "@/hooks/useSelectedProviders";
import { cn } from "@/lib/cn";

const ONBOARDING_PROVIDERS = PROVIDERS.filter((p) =>
  ["netflix", "hulu", "max", "disney_plus", "apple_tv_plus", "prime_video", "paramount_plus", "peacock"].includes(p.key),
);

export function OnboardingHero({ onDone }: { onDone?: () => void }) {
  const { selected, toggle, setSelected } = useSelectedProviders();
  const reduce = useReducedMotion();

  const handleToggle = (k: string, name: string) => {
    const willBeOn = !selected.includes(k);
    toggle(k);
    toast.success(willBeOn ? `Added ${name}` : `Removed ${name}`, { duration: 1200 });
  };

  const skipAll = () => {
    setSelected(ONBOARDING_PROVIDERS.map((p) => p.key));
    toast.success("Added all major US services — change anytime in Services.");
    try {
      window.localStorage.setItem("stream-score:onboarded", "1");
    } catch {}
    onDone?.();
  };

  const finish = () => {
    toast.success(
      `Showing what's on ${selected.length} ${selected.length === 1 ? "service" : "services"}.`,
    );
    try {
      window.localStorage.setItem("stream-score:onboarded", "1");
    } catch {}
    onDone?.();
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
      className="overflow-hidden rounded-3xl border border-[var(--color-border-strong)] bg-[var(--color-surface)]/30 p-6 backdrop-blur-md sm:p-12"
    >
      <div className="mx-auto max-w-2xl space-y-5 text-center">
        <motion.div
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 220, damping: 18 }}
          className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1 text-xs text-[var(--color-muted)]"
        >
          <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          Welcome
        </motion.div>
        <h1 className="font-display text-5xl leading-[0.95] tracking-[-0.02em] sm:text-7xl">
          What can you{" "}
          <span className="italic text-[var(--color-accent)]">watch</span>{" "}
          tonight?
        </h1>
        <p className="mx-auto max-w-lg text-base text-[var(--color-muted)]">
          Pick the streaming services you have access to. We&apos;ll only show
          movies you can actually watch — ranked by IMDb, Rotten Tomatoes, and
          Metacritic combined.
        </p>
      </div>

      <ul
        role="group"
        aria-label="Streaming services"
        className="mx-auto mt-9 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {ONBOARDING_PROVIDERS.map((p, i) => {
          const on = selected.includes(p.key);
          const brand = getBrandSwatch(p.key);
          const fgClass = brand.fg === "light" ? "text-white" : "text-zinc-900";
          return (
            <li key={p.key}>
              <motion.button
                type="button"
                onClick={() => handleToggle(p.key, p.name)}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0 : 0.05 * i, duration: 0.3 }}
                whileHover={reduce ? undefined : { y: -2, scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  "brand-tile relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl px-2 py-4 text-center transition",
                  on ? "shadow-xl" : "opacity-95",
                )}
                style={{
                  background: brand.bg,
                  boxShadow: on ? `0 0 0 3px var(--color-accent), 0 18px 40px -10px ${brand.glow ?? brand.bg}` : undefined,
                }}
                aria-pressed={on}
                aria-label={`${p.name}, ${on ? "selected" : "not selected"}`}
              >
                <AnimatePresence>
                  {on && (
                    <motion.span
                      initial={reduce ? false : { scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={reduce ? undefined : { scale: 0.5, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 22 }}
                      className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-zinc-900"
                      aria-hidden
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
                <span
                  className={cn(
                    "rounded-lg px-2 py-1 text-base font-bold leading-tight backdrop-blur-sm",
                    brand.fg === "light" ? "bg-black/30" : "bg-white/30",
                    fgClass,
                  )}
                >
                  {p.short}
                </span>
              </motion.button>
            </li>
          );
        })}
      </ul>

      <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={finish}
          disabled={selected.length === 0}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold transition",
            selected.length === 0
              ? "cursor-not-allowed bg-[var(--color-surface)] text-[var(--color-subtle)]"
              : "bg-[var(--color-accent)] text-zinc-900 hover:brightness-105",
          )}
        >
          {selected.length === 0
            ? "Pick at least one service"
            : `Continue with ${selected.length} ${selected.length === 1 ? "service" : "services"} →`}
        </button>
        <button
          type="button"
          onClick={skipAll}
          className="text-sm text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-text)] hover:underline"
        >
          Skip — show me everything
        </button>
      </div>
    </motion.div>
  );
}
