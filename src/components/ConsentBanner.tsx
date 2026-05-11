"use client";

// EU consent gate. The server detects the country via `getRequestContext` and
// sets `consentGranted` based on the `ss_consent` cookie. This banner is
// rendered only when consent is unresolved (no cookie set) AND the server
// passes `forceShow`. Non-EU users skip the banner entirely.
//
// Two outcomes:
//   - "Accept": writes ss_consent=granted (1y) and reloads to re-fetch context.
//   - "Decline": writes ss_consent=denied (1y) and hides the banner.

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { dur, ease } from "@/lib/motion";
import { cn } from "@/lib/cn";

const COOKIE_NAME = "ss_consent";
const ONE_YEAR_SEC = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((p) => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${ONE_YEAR_SEC}; SameSite=Lax`;
}

export interface ConsentBannerProps {
  /**
   * If true, the banner renders regardless of country. Useful when the
   * server has already determined the user is in the EU and consent is
   * unresolved. When undefined we behave conservatively: show only if
   * no cookie has been set yet.
   */
  forceShow?: boolean;
  className?: string;
  onChange?: (granted: boolean) => void;
}

export function ConsentBanner({ forceShow, className, onChange }: ConsentBannerProps) {
  const reduce = useReducedMotion();
  // Compute the initial open state from cookies + props lazily, so we never
  // need to call setState inside an effect on mount.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    const existing = readCookie(COOKIE_NAME);
    if (existing) return false;
    return forceShow !== false;
  });

  const decide = (granted: boolean) => {
    writeCookie(COOKIE_NAME, granted ? "granted" : "denied");
    setOpen(false);
    onChange?.(granted);
    // Note: we deliberately do NOT reload — server-side reads of the cookie
    // happen on the next navigation. If you need an immediate refresh, the
    // caller can do it via onChange.
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="false"
          aria-label="Privacy preferences"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: dur.regular, ease: ease.entrance }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-[100] mx-auto w-full max-w-[680px] px-4 pb-4 sm:px-6 sm:pb-6",
            className,
          )}
        >
          <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]/95 p-4 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.85)] backdrop-blur sm:p-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-[14px] font-medium tracking-tight text-[var(--color-text)]">
                  A quick note before we begin
                </h2>
                <p className="mt-1.5 text-[13px] leading-snug text-[var(--color-muted)]">
                  stream-score uses your selected services and the local time of day to
                  pick what&apos;s on tonight. We&apos;d like to remember those choices on
                  this device so the page feels personal next time. No accounts, no
                  tracking pixels, no third-party ads. Your data stays on your device.
                </p>
              </div>
              <button
                type="button"
                onClick={() => decide(false)}
                className="-m-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-subtle)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                aria-label="Decline and close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => decide(false)}
                className="rounded-full border border-[var(--color-border-strong)] bg-transparent px-4 py-2 text-[13px] text-[var(--color-text)]/85 transition hover:bg-[var(--color-surface)]"
              >
                Only essentials
              </button>
              <button
                type="button"
                onClick={() => decide(true)}
                className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-black/90 transition hover:brightness-110"
              >
                Accept and continue
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
