"use client";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";
import type { TmdbGenre } from "@/lib/types";

export interface FilterValues {
  query: string;
  genres: number[];
  yearMin: number;
  yearMax: number;
  ratingMin: number;
  runtimeMax: number;
  language: string;
  sort: SortKey;
  onlyMine: boolean;
}

export type SortKey =
  | "best"
  | "imdb"
  | "newest"
  | "oldest"
  | "runtime_asc"
  | "runtime_desc"
  | "rating";

const CURRENT_YEAR = new Date().getFullYear();

export const DEFAULT_FILTERS: FilterValues = {
  query: "",
  genres: [],
  yearMin: 1970,
  yearMax: CURRENT_YEAR,
  ratingMin: 0,
  runtimeMax: 240,
  language: "",
  sort: "best",
  onlyMine: true,
};

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "best", label: "Best overall" },
  { value: "imdb", label: "Highest rated" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "runtime_asc", label: "Shortest" },
  { value: "runtime_desc", label: "Longest" },
];

const LANGUAGES = [
  { code: "", label: "Any language" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "hi", label: "Hindi" },
];

export function countActiveFilters(v: FilterValues): number {
  let n = 0;
  if (v.genres.length) n++;
  if (v.yearMin !== DEFAULT_FILTERS.yearMin || v.yearMax !== DEFAULT_FILTERS.yearMax) n++;
  if (v.ratingMin > 0) n++;
  if (v.runtimeMax < 240) n++;
  if (v.language) n++;
  if (v.sort !== "best") n++;
  return n;
}

export function MovieFilters({
  value,
  onChange,
  genres,
  hideSearch = false,
}: {
  value: FilterValues;
  onChange: (v: FilterValues) => void;
  genres: TmdbGenre[];
  hideSearch?: boolean;
}) {
  const commit = (next: FilterValues) => onChange(next);

  const toggleGenre = (id: number) => {
    const next = value.genres.includes(id)
      ? value.genres.filter((g) => g !== id)
      : [...value.genres, id];
    commit({ ...value, genres: next });
  };

  return (
    <div className="space-y-6">
      {!hideSearch && (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="search"
            inputMode="search"
            placeholder="Search by title…"
            value={value.query}
            onChange={(e) => commit({ ...value, query: e.target.value })}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-4 py-2.5 text-sm placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <select
            value={value.sort}
            onChange={(e) => commit({ ...value, sort: e.target.value as SortKey })}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-3 py-2.5 text-sm focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {hideSearch && (
        <div>
          <Label>Sort by</Label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {SORT_OPTIONS.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => commit({ ...value, sort: o.value })}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm transition",
                  value.sort === o.value
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)]",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label>
          Year range{" "}
          <span className="font-mono text-[10px] text-[var(--color-muted)]">
            {value.yearMin} – {value.yearMax}
          </span>
        </Label>
        <DualSlider
          min={1920}
          max={CURRENT_YEAR + 1}
          step={1}
          value={[value.yearMin, value.yearMax]}
          onValueChange={(v) =>
            commit({ ...value, yearMin: v[0], yearMax: v[1] })
          }
        />
      </div>

      <div>
        <Label>
          Min audience rating{" "}
          <span className="font-mono text-[10px] text-[var(--color-muted)]">
            {value.ratingMin.toFixed(1)}+
          </span>
        </Label>
        <SingleSlider
          min={0}
          max={9}
          step={0.5}
          value={[value.ratingMin]}
          onValueChange={(v) => commit({ ...value, ratingMin: v[0] })}
        />
      </div>

      <div>
        <Label>
          Max runtime{" "}
          <span className="font-mono text-[10px] text-[var(--color-muted)]">
            ≤ {value.runtimeMax} min
          </span>
        </Label>
        <SingleSlider
          min={60}
          max={240}
          step={5}
          value={[value.runtimeMax]}
          onValueChange={(v) => commit({ ...value, runtimeMax: v[0] })}
        />
      </div>

      <div>
        <Label>Language</Label>
        <div className="flex flex-wrap gap-1.5">
          {LANGUAGES.map((l) => (
            <button
              type="button"
              key={l.code || "any"}
              onClick={() => commit({ ...value, language: l.code })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition",
                value.language === l.code
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                  : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)]",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Genres</Label>
        <div className="flex flex-wrap gap-1.5">
          {genres.map((g) => {
            const on = value.genres.includes(g.id);
            return (
              <button
                type="button"
                key={g.id}
                onClick={() => toggleGenre(g.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition",
                  on
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-border-strong)]",
                )}
              >
                {g.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-3">
        <div>
          <div className="text-sm font-medium">Only on my services</div>
          <div className="text-xs text-[var(--color-muted)]">
            Hide movies you can&apos;t stream now.
          </div>
        </div>
        <Switch.Root
          checked={value.onlyMine}
          onCheckedChange={(v) => commit({ ...value, onlyMine: v })}
          className="relative h-6 w-11 rounded-full bg-[var(--color-surface-2)] outline-none transition data-[state=checked]:bg-[var(--color-accent)]"
        >
          <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition will-change-transform data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted)]">
      <span>{children}</span>
    </div>
  );
}

function DualSlider({
  min,
  max,
  step,
  value,
  onValueChange,
}: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onValueChange: (v: [number, number]) => void;
}) {
  return (
    <Slider.Root
      className="relative flex h-5 w-full touch-none select-none items-center"
      min={min}
      max={max}
      step={step}
      value={value}
      onValueChange={(v) => onValueChange([v[0], v[1]] as [number, number])}
      minStepsBetweenThumbs={1}
    >
      <Slider.Track className="relative h-1.5 grow rounded-full bg-[var(--color-surface-2)]">
        <Slider.Range className="absolute h-full rounded-full bg-[var(--color-accent)]" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full bg-white shadow-md outline-none ring-[var(--color-accent)] focus-visible:ring-2" />
      <Slider.Thumb className="block h-4 w-4 rounded-full bg-white shadow-md outline-none ring-[var(--color-accent)] focus-visible:ring-2" />
    </Slider.Root>
  );
}

function SingleSlider({
  min,
  max,
  step,
  value,
  onValueChange,
}: {
  min: number;
  max: number;
  step: number;
  value: [number];
  onValueChange: (v: [number]) => void;
}) {
  return (
    <Slider.Root
      className="relative flex h-5 w-full touch-none select-none items-center"
      min={min}
      max={max}
      step={step}
      value={value}
      onValueChange={(v) => onValueChange([v[0]] as [number])}
    >
      <Slider.Track className="relative h-1.5 grow rounded-full bg-[var(--color-surface-2)]">
        <Slider.Range className="absolute h-full rounded-full bg-[var(--color-accent)]" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full bg-white shadow-md outline-none ring-[var(--color-accent)] focus-visible:ring-2" />
    </Slider.Root>
  );
}
