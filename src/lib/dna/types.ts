// Shared types for the stream·score DNA scoring engine.
//
// All scoring is performed in a 7-dimensional "taste space" whose axes are
// fixed by `AXES`. Each axis is signed: positive values lean toward the second
// pole listed in the axis key, negative values lean toward the first. For
// example `lightDark = +1.0` is darker, `lightDark = -1.0` is lighter. We
// only enforce ordering by convention — math treats every axis symmetrically.

/** The 7 fixed taste axes, in canonical index order. */
export const AXES = [
  "prestigePopcorn",
  "modernClassic",
  "lightDark",
  "realityFantasy",
  "slowKinetic",
  "soloCommunal",
  "familiarForeign",
] as const;

export type AxisKey = (typeof AXES)[number];

/** A fixed-length 7-vector in taste space. */
export type Vector7 = number[];

/** Raw answer for a single binary question. `"skip"` contributes zero signal. */
export type AnswerValue = "a" | "b" | "skip";

/** Map from question id → answer. */
export type Answers = Record<string, AnswerValue>;

/** Per-question loading vectors for option "a" and option "b". */
export interface QuestionLoading {
  a: Vector7;
  b: Vector7;
}

/** Shape of `data/dna/loadings.json` produced by Agent 1. */
export interface Loadings {
  axes: readonly AxisKey[];
  loadings: Record<string, QuestionLoading>;
}

/** A taste archetype centroid in 7-space. */
export interface Archetype {
  key: string;
  name: string;
  tagline: string;
  anchorFilm: { title: string; tmdbId: number; year: number };
  anchorDirector: string;
  centroid: Vector7;
}

/** One ranked archetype hit. */
export interface ArchetypeScore {
  archetype: Archetype;
  /** Softmax-normalized score in [0, 1]. */
  score: number;
  /** Raw cosine similarity in [-1, 1]. */
  rawCosine: number;
}

export interface ArchetypeAssignment {
  top1: Archetype;
  top2: Archetype;
  /** 0..1 — how clearly top1 beats top2, normalized. */
  confidence: number;
  /** All archetypes sorted desc by score. */
  topN: ArchetypeScore[];
  /** True when too many skips were used to trust the assignment. */
  lowSignal?: boolean;
}

/** One binary question, matching the shape Agent 2 expects. */
export interface Question {
  id: string;
  prompt: string;
  a: { label: string; loading: Vector7 };
  b: { label: string; loading: Vector7 };
  /** Optional category tag (e.g. "disambiguator", "lie_detector"). */
  kind?: string;
}

/** Disambiguator bank keyed by sorted "keyA|keyB" archetype pair. */
export interface DisambiguatorBank {
  [archetypePairKey: string]: {
    questions: {
      prompt: string;
      a: { label: string; loading: Vector7 };
      b: { label: string; loading: Vector7 };
    }[];
  };
}

/** Lie-detector verdict applied as a downweight on the final vector. */
export interface LieDetectorFlags {
  detected: boolean;
  /** Multiplier applied to the final vector when `detected`. */
  downweight: number;
}
