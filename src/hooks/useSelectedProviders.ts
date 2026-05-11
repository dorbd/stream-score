"use client";
import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "stream-score:selected-providers";
const EVENT = "stream-score:providers-changed";

let cached: string[] = [];
let cacheVersion = 0;

function readFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function refreshCache(): void {
  const next = readFromStorage();
  if (
    next.length !== cached.length ||
    next.some((v, i) => v !== cached[i])
  ) {
    cached = next;
    cacheVersion++;
  }
}

function writeToStorage(keys: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  cached = keys;
  cacheVersion++;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: keys }));
}

function subscribe(callback: () => void): () => void {
  const onChange = () => {
    refreshCache();
    callback();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): string[] {
  // Lazily hydrate the cache on first read in the browser.
  if (cacheVersion === 0) refreshCache();
  return cached;
}

function getServerSnapshot(): string[] {
  return [];
}

export function useSelectedProviders(): {
  selected: string[];
  setSelected: (keys: string[]) => void;
  toggle: (key: string) => void;
  hydrated: boolean;
} {
  const selected = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // After useSyncExternalStore returns from the browser, hydrated is implicitly true.
  const hydrated = typeof window !== "undefined";

  const setSelected = useCallback((keys: string[]) => {
    writeToStorage(Array.from(new Set(keys)));
  }, []);

  const toggle = useCallback((key: string) => {
    const prev = getSnapshot();
    const next = prev.includes(key)
      ? prev.filter((k) => k !== key)
      : [...prev, key];
    writeToStorage(next);
  }, []);

  return { selected, setSelected, toggle, hydrated };
}
