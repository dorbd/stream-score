"use client";
// Dev-only `window.__streamscore` helpers. Useful when debugging
// personalization in production — these don't ship in `next build`'s
// minified bundles because we gate on NODE_ENV.

import { readAnchor, clearAnchor, ANCHOR_STORAGE_KEY } from "./anchor";
import { loadTaste, resetTaste, TASTE_STORAGE_KEY } from "./taste";
import { readEvents, clearEvents, EVENTS_STORAGE_KEY } from "./track";

export interface StreamscoreDevtools {
  dumpEvents(): ReturnType<typeof readEvents>;
  dumpTaste(): {
    means: Record<string, number>;
    variances: Record<string, number>;
  };
  dumpAnchor(): ReturnType<typeof readAnchor>;
  clearAll(): void;
}

declare global {
  interface Window {
    __streamscore?: StreamscoreDevtools;
  }
}

let attached = false;

export function attachDevtools(): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "production") return;
  if (attached) return;
  attached = true;
  const TASTE_DIMS = [
    "pace",
    "tone",
    "density",
    "palette",
    "era",
    "auteur",
    "runtime",
    "weirdness",
  ] as const;
  const api: StreamscoreDevtools = {
    dumpEvents: () => readEvents(),
    dumpTaste: () => {
      const t = loadTaste();
      const means: Record<string, number> = {};
      const variances: Record<string, number> = {};
      for (let i = 0; i < TASTE_DIMS.length; i++) {
        means[TASTE_DIMS[i]] = t.means[i];
        variances[TASTE_DIMS[i]] = t.variances[i];
      }
      return { means, variances };
    },
    dumpAnchor: () => readAnchor(),
    clearAll: () => {
      clearAnchor();
      resetTaste();
      clearEvents();
      // Belt-and-suspenders: also wipe the raw storage keys in case
      // the in-module caches got out of sync somehow.
      try {
        window.localStorage.removeItem(ANCHOR_STORAGE_KEY);
        window.localStorage.removeItem(TASTE_STORAGE_KEY);
        window.localStorage.removeItem(EVENTS_STORAGE_KEY);
      } catch {
        // ignore
      }
    },
  };
  window.__streamscore = api;
}
