"use client";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PROVIDERS } from "@/lib/providers";
import { getBrandSwatch } from "@/lib/providerBrands";
import { useSelectedProviders } from "@/hooks/useSelectedProviders";
import { dur, ease } from "@/lib/motion";
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
    toast.success(willBeOn ? `Added ${name}` : `Removed ${name}`, { duration: 1100 });
  };

  const skipAll = () => {
    setSelected(ONBOARDING_PROVIDERS.map((p) => p.key));
    toast.success("Added all major US services — change anytime in Services.");
    try { window.localStorage.setItem("stream-score:onboarded", "1"); } catch {}
    onDone?.();
  };

  const finish = () => {
    toast.success(
      `Showing what's on ${selected.length} ${selected.length === 1 ? "service" : "services"}.`,
    );
    try { window.localStorage.setItem("stream-score:onboarded", "1"); } catch {}
    onDone?.();
  };

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: dur.regular }}
      className="relative overflow-hidden rounded-[var(--radius-hero)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]/40 px-5 py-10 sm:px-10 sm:py-14"
    >
      {/* faint grain backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]" style={{
        backgroundImage:
          "radial-gradient(2px 2px at 30% 20%, rgba(255,255,255,0.6) 1px, transparent 50%), radial-gradient(1.5px 1.5px at 70% 60%, rgba(255,255,255,0.5) 1px, transparent 50%), radial-gradient(1.8px 1.8px at 40% 80%, rgba(255,255,255,0.4) 1px, transparent 50%)",
        backgroundSize: "200px 200px, 250px 250px, 180px 180px",
      }} />

      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0, duration: dur.quick, ease: ease.entrance }}
          className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-1 text-xs text-[var(--color-muted)]"
        >
          <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
          <span className="rubric" style={{ letterSpacing: "0.2em" }}>Welcome</span>
        </motion.div>
        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: dur.scenic, ease: ease.entrance }}
          className="font-display text-5xl leading-[0.95] tracking-[-0.025em] sm:text-7xl"
        >
          What can you{" "}
          <RevealWord delay={0.26} reduce={!!reduce}>
            <span className="italic text-[var(--color-accent)]">watch</span>
          </RevealWord>{" "}
          tonight?
        </motion.h1>
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34, duration: dur.regular }}
          className="mx-auto max-w-lg text-base text-[var(--color-muted)]"
        >
          Tap the services you pay for — we&apos;ll do the rest.
        </motion.p>
      </div>

      <ul
        role="group"
        aria-label="Streaming services"
        className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4"
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
                initial={reduce ? false : { opacity: 0, y: 24, rotate: -6 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                transition={{
                  delay: reduce ? 0 : 0.4 + 0.035 * i,
                  duration: dur.scenic,
                  ease: ease.entrance,
                }}
                whileTap={{ scale: 0.985 }}
                className={cn(
                  "brand-tile relative flex aspect-[5/4] w-full flex-col items-center justify-center overflow-hidden rounded-[var(--radius-tile)] px-3 text-center transition",
                )}
                style={{
                  background: brand.bg,
                  // Marquee bulb: lit from above, soft inner shadow from below
                  boxShadow: on
                    ? `inset 0 1px 0 0 rgba(255,255,255,0.15), inset 0 -24px 32px -16px rgba(0,0,0,0.6), 0 0 0 2px var(--color-accent), 0 24px 50px -16px ${brand.glow ?? brand.bg}`
                    : `inset 0 1px 0 0 rgba(255,255,255,0.10), inset 0 -24px 32px -16px rgba(0,0,0,0.55), 0 1px 0 0 rgba(255,255,255,0.04)`,
                  transform: on ? "scale(0.985)" : undefined,
                }}
                aria-pressed={on}
                aria-label={`${p.name}, ${on ? "selected" : "not selected"}`}
              >
                <span
                  className={cn(
                    "font-display text-xl leading-tight tracking-tight sm:text-2xl",
                    fgClass,
                  )}
                  style={{ textShadow: brand.fg === "light" ? "0 1px 2px rgba(0,0,0,0.4)" : "0 1px 2px rgba(255,255,255,0.25)" }}
                >
                  {p.short}
                </span>
                {/* Bottom selected indicator */}
                <AnimatePresence>
                  {on && (
                    <motion.span
                      key="bar"
                      initial={reduce ? false : { scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      exit={reduce ? undefined : { scaleX: 0 }}
                      transition={{ duration: dur.regular, ease: ease.entrance }}
                      className="absolute inset-x-3 bottom-2 h-[3px] origin-left rounded-full bg-[var(--color-accent)]"
                      aria-hidden
                    />
                  )}
                </AnimatePresence>
              </motion.button>
            </li>
          );
        })}
      </ul>

      {/* CTA ribbon: slides up only when something is selected */}
      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            key="cta"
            initial={reduce ? false : { y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? undefined : { y: 80, opacity: 0 }}
            transition={{ duration: dur.scenic, ease: ease.entrance }}
            className="mx-auto mt-10 flex max-w-md items-center justify-center"
          >
            <button
              type="button"
              onClick={finish}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-[var(--color-bg)] shadow-[0_18px_40px_-10px_var(--color-accent)] hover:brightness-105"
            >
              Continue with {selected.length} {selected.length === 1 ? "service" : "services"} →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6 flex flex-col items-center gap-2 text-sm sm:flex-row sm:justify-center">
        {selected.length === 0 && (
          <span className="text-[var(--color-subtle)]">Tap one or more above to continue.</span>
        )}
        <button
          type="button"
          onClick={skipAll}
          className="text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-text)] hover:underline"
        >
          I&apos;ll sort this out later
        </button>
      </div>
    </motion.section>
  );
}

function RevealWord({
  children,
  delay,
  reduce,
}: {
  children: React.ReactNode;
  delay: number;
  reduce: boolean;
}) {
  if (reduce) return <span>{children}</span>;
  return (
    <span style={{ display: "inline-block", overflow: "hidden", verticalAlign: "baseline" }}>
      <motion.span
        initial={{ clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)" }}
        transition={{ delay, duration: 0.42, ease: ease.entrance }}
        style={{ display: "inline-block" }}
      >
        {children}
      </motion.span>
    </span>
  );
}
