// Local-only instrumentation. CSP-safe: NO fetch, NO sendBeacon, NO
// network of any kind. We only write to localStorage. A future ranking
// path can choose to consume these events, but today this file is
// write-only at the read path.
//
// Ring buffer is capped at 50 entries (~1.5 KB on disk when serialised).

export const EVENTS_STORAGE_KEY = "events";
export const EVENTS_RING_SIZE = 50;
const HOVER_THRESHOLD_MS = 600;

export type TrackEventKind =
  | "impression" // card became visible
  | "dwell" // hover passed HOVER_THRESHOLD_MS
  | "click" // tap/click
  | "dismiss" // hide-from-rail
  | "watchlist" // add to watchlist
  | "anchor_set" // user picked an anchor film
  | "anchor_clear"; // user cleared anchor via chip × or modal

export interface TrackEvent {
  t: number; // epoch ms
  k: TrackEventKind;
  m?: number; // tmdb id (if applicable)
  d?: number; // duration ms (hover dwell)
  s?: string; // surface, e.g. "alts" / "bucket" / "stretch"
}

function readBuffer(): TrackEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is TrackEvent =>
        e &&
        typeof e === "object" &&
        typeof e.t === "number" &&
        typeof e.k === "string",
    );
  } catch {
    return [];
  }
}

function writeBuffer(buf: TrackEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(buf));
  } catch {
    // ignore — storage full / disabled
  }
}

export function logEvent(e: Omit<TrackEvent, "t"> & { t?: number }): void {
  if (typeof window === "undefined") return;
  const buf = readBuffer();
  const entry: TrackEvent = { t: e.t ?? Date.now(), k: e.k };
  if (typeof e.m === "number") entry.m = e.m;
  if (typeof e.d === "number") entry.d = e.d;
  if (typeof e.s === "string") entry.s = e.s;
  buf.push(entry);
  while (buf.length > EVENTS_RING_SIZE) buf.shift();
  writeBuffer(buf);
}

export function readEvents(): TrackEvent[] {
  return readBuffer();
}

export function clearEvents(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(EVENTS_STORAGE_KEY);
  } catch {
    // no-op
  }
}

// ---- IntersectionObserver wrapper for impression tracking. ----
//
// Returns a teardown fn. Pass the surface name and a (el → tmdbId)
// resolver — the resolver lets callers attach impressions to any
// existing element without rewriting markup.

export interface ImpressionObserverOpts {
  surface: string;
  resolveId: (el: Element) => number | null;
  threshold?: number; // 0..1, default 0.5
}

export function observeImpressions(
  els: Iterable<Element>,
  opts: ImpressionObserverOpts,
): () => void {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
    return () => {};
  }
  const seen = new WeakSet<Element>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const ent of entries) {
        if (!ent.isIntersecting) continue;
        if (seen.has(ent.target)) continue;
        const id = opts.resolveId(ent.target);
        if (id == null) continue;
        seen.add(ent.target);
        logEvent({ k: "impression", m: id, s: opts.surface });
        io.unobserve(ent.target);
      }
    },
    { threshold: opts.threshold ?? 0.5 },
  );
  for (const el of els) io.observe(el);
  return () => io.disconnect();
}

// ---- Hover dwell tracking. ----
//
// Attach to an element; if the pointer stays >= 600ms, emit a "dwell".
// Returns a teardown fn.

export function trackHoverDwell(
  el: HTMLElement,
  opts: { tmdbId: number; surface: string; thresholdMs?: number },
): () => void {
  const threshold = opts.thresholdMs ?? HOVER_THRESHOLD_MS;
  let enteredAt = 0;
  let fired = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onEnter = () => {
    enteredAt = Date.now();
    fired = false;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (fired) return;
      fired = true;
      logEvent({
        k: "dwell",
        m: opts.tmdbId,
        d: Date.now() - enteredAt,
        s: opts.surface,
      });
    }, threshold);
  };
  const onLeave = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  el.addEventListener("pointerenter", onEnter);
  el.addEventListener("pointerleave", onLeave);
  return () => {
    if (timer) clearTimeout(timer);
    el.removeEventListener("pointerenter", onEnter);
    el.removeEventListener("pointerleave", onLeave);
  };
}
