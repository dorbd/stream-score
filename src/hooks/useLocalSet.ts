"use client";
// Generic localStorage-backed number-set hook with cross-tab sync,
// modeled on useSelectedProviders but parameterized by storage key.
import { useCallback, useSyncExternalStore } from "react";

interface Slot {
  cached: number[];
  version: number;
  ready: boolean;
}

const slots = new Map<string, Slot>();
const EVENT_PREFIX = "stream-score:set-changed:";

function eventName(key: string): string {
  return `${EVENT_PREFIX}${key}`;
}

function readStorage(key: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
      : [];
  } catch {
    return [];
  }
}

function getSlot(key: string): Slot {
  let slot = slots.get(key);
  if (!slot) {
    slot = { cached: [], version: 0, ready: false };
    slots.set(key, slot);
  }
  return slot;
}

function refresh(key: string): void {
  const slot = getSlot(key);
  const next = readStorage(key);
  if (
    !slot.ready ||
    next.length !== slot.cached.length ||
    next.some((v, i) => v !== slot.cached[i])
  ) {
    slot.cached = next;
    slot.version++;
    slot.ready = true;
  }
}

function writeStorage(key: string, values: number[]): void {
  if (typeof window === "undefined") return;
  const dedup = Array.from(new Set(values));
  window.localStorage.setItem(key, JSON.stringify(dedup));
  const slot = getSlot(key);
  slot.cached = dedup;
  slot.version++;
  window.dispatchEvent(new CustomEvent(eventName(key), { detail: dedup }));
}

export function useLocalNumberSet(storageKey: string): {
  values: number[];
  has: (id: number) => boolean;
  add: (id: number) => void;
  remove: (id: number) => void;
  toggle: (id: number) => boolean; // returns new state
  clear: () => void;
  hydrated: boolean;
} {
  const slot = getSlot(storageKey);

  const subscribe = useCallback(
    (cb: () => void) => {
      const onChange = () => {
        refresh(storageKey);
        cb();
      };
      window.addEventListener(eventName(storageKey), onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(eventName(storageKey), onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    [storageKey],
  );

  const getSnapshot = useCallback(() => {
    if (!slot.ready) refresh(storageKey);
    return slot.cached;
  }, [slot, storageKey]);

  const getServerSnapshot = useCallback(() => [] as number[], []);

  const values = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = typeof window !== "undefined";

  const has = useCallback((id: number) => values.includes(id), [values]);
  const add = useCallback(
    (id: number) => {
      const cur = getSlot(storageKey).cached;
      if (!cur.includes(id)) writeStorage(storageKey, [...cur, id]);
    },
    [storageKey],
  );
  const remove = useCallback(
    (id: number) => {
      const cur = getSlot(storageKey).cached;
      if (cur.includes(id)) writeStorage(storageKey, cur.filter((x) => x !== id));
    },
    [storageKey],
  );
  const toggle = useCallback(
    (id: number) => {
      const cur = getSlot(storageKey).cached;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      writeStorage(storageKey, next);
      return next.includes(id);
    },
    [storageKey],
  );
  const clear = useCallback(() => writeStorage(storageKey, []), [storageKey]);

  return { values, has, add, remove, toggle, clear, hydrated };
}

export function useWatchlist() {
  return useLocalNumberSet("stream-score:watchlist");
}

export function useHidden() {
  return useLocalNumberSet("stream-score:hidden");
}
