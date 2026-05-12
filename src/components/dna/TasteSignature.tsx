// TasteSignature — pure presentation chip row derived from the 7-dim DNA vector.
//
// Algorithm: take the 3 axes with the largest absolute magnitude and map each
// to an emoji + label by sign. Output is a single horizontal row of pill
// chips. Replaces the dense DimChart on the reveal page.

const AXIS_LABELS: Array<{ pos: { emoji: string; label: string }; neg: { emoji: string; label: string } }> = [
  // 0 prestigePopcorn: + Prestige / - Crowd-pleaser
  { pos: { emoji: "🎭", label: "Prestige" }, neg: { emoji: "🍿", label: "Crowd-pleaser" } },
  // 1 modernClassic: + Modern / - Classic
  { pos: { emoji: "🌃", label: "Modern" }, neg: { emoji: "🎞️", label: "Classic" } },
  // 2 lightDark: + Bright / - Mood-driven
  { pos: { emoji: "☀️", label: "Bright" }, neg: { emoji: "🌒", label: "Mood-driven" } },
  // 3 realityFantasy: + Grounded / - Fantastical
  { pos: { emoji: "🪞", label: "Grounded" }, neg: { emoji: "🦄", label: "Fantastical" } },
  // 4 slowKinetic: + Slow-burn / - Kinetic
  { pos: { emoji: "🕯️", label: "Slow-burn" }, neg: { emoji: "⚡", label: "Kinetic" } },
  // 5 soloCommunal: + Interior / - Communal
  { pos: { emoji: "🌿", label: "Interior" }, neg: { emoji: "🍷", label: "Communal" } },
  // 6 familiarForeign: + Familiar / - Foreign-curious
  { pos: { emoji: "🏡", label: "Familiar" }, neg: { emoji: "🌏", label: "Foreign-curious" } },
];

interface Chip {
  emoji: string;
  label: string;
  /** Signed magnitude used for ordering. */
  weight: number;
}

function pickChips(vector: number[]): Chip[] {
  // Safe: pad to length 7 if input is short, clamp to first 7 if long.
  const v: number[] = new Array(AXIS_LABELS.length).fill(0);
  for (let i = 0; i < AXIS_LABELS.length; i++) {
    const raw = vector[i];
    v[i] = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  }
  const indexed = v.map((value, i) => ({ i, value, abs: Math.abs(value) }));
  indexed.sort((a, b) => b.abs - a.abs);
  const top = indexed.slice(0, 3).filter((d) => d.abs > 0);
  return top.map(({ i, value }) => {
    const pole = value >= 0 ? AXIS_LABELS[i].pos : AXIS_LABELS[i].neg;
    return { emoji: pole.emoji, label: pole.label, weight: value };
  });
}

export interface TasteSignatureProps {
  vector: number[];
}

export function TasteSignature({ vector }: TasteSignatureProps) {
  const chips = pickChips(vector);
  if (chips.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-sm"
      aria-label="Your taste signature"
    >
      {chips.map((c) => (
        <span
          key={c.label}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-3 py-1.5"
        >
          <span aria-hidden>{c.emoji}</span>
          <span className="font-medium">{c.label}</span>
        </span>
      ))}
    </div>
  );
}
