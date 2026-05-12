// pickDisambiguators(top1Key, top2Key, bank) — choose 3 follow-up questions.
//
// The disambiguator bank is indexed by sorted "keyA|keyB" pairs. If the user's
// current top1/top2 has a hand-curated entry, we use the first 3 questions
// from that entry. Otherwise we synthesize 3 fallback "confidence builder"
// probes targeting the biggest-variance axes between the two archetype
// centroids — so we still ask the most discriminating questions even when
// the pair was not pre-authored.
//
// All output Questions have stable ids prefixed with `da_` so downstream
// scoring (which keys on question id) does not collide with the main bank.

import type {
  Archetype,
  AxisKey,
  DisambiguatorBank,
  Question,
  Vector7,
} from "./types";
import { AXES } from "./types";

/** Stable key for a disambiguator bank lookup: archetype keys sorted + joined. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/**
 * Pick exactly `count` disambiguator questions for the (top1, top2) pair.
 *
 * Prefers a hand-curated entry from `bank`. When none exists and `archetypes`
 * is supplied, falls back to synthesized probes along the highest-variance
 * axes between the two centroids. With no centroids available, returns
 * generic axis probes.
 */
export function pickDisambiguators(
  top1Key: string,
  top2Key: string,
  bank: DisambiguatorBank,
  count: 3 = 3,
  archetypes?: Archetype[],
): Question[] {
  const key = pairKey(top1Key, top2Key);
  const entry = bank[key];

  if (entry && entry.questions.length > 0) {
    return entry.questions.slice(0, count).map((q, i) => ({
      id: `da_${key}_${i}`,
      prompt: q.prompt,
      a: q.a,
      b: q.b,
      kind: "disambiguator",
    }));
  }

  // Fallback: synthesize from centroid diff if we have the archetypes.
  if (archetypes) {
    const top1 = archetypes.find((a) => a.key === top1Key);
    const top2 = archetypes.find((a) => a.key === top2Key);
    if (top1 && top2) {
      return synthesizeFallback(top1, top2, count);
    }
  }

  // Last-resort fallback: three generic axis-probes that don't depend on
  // any centroid information. Returned with neutral wording so the UI can
  // still render them.
  return GENERIC_FALLBACK.slice(0, count);
}

/**
 * Build `count` probe questions targeting the axes where top1 and top2 differ
 * most. Each probe loads ±1.0 on its target axis only, so an "a" vs "b"
 * answer cleanly pulls the user toward one archetype or the other.
 */
function synthesizeFallback(
  top1: Archetype,
  top2: Archetype,
  count: number,
): Question[] {
  const diffs: { axis: AxisKey; idx: number; delta: number }[] = AXES.map(
    (axis, idx) => ({
      axis,
      idx,
      delta: (top1.centroid[idx] ?? 0) - (top2.centroid[idx] ?? 0),
    }),
  );
  diffs.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  const picked = diffs.slice(0, count);
  return picked.map((d, i) => {
    const aVec = oneHot(d.idx, d.delta >= 0 ? 1 : -1);
    const bVec = oneHot(d.idx, d.delta >= 0 ? -1 : 1);
    const tmpl = AXIS_PROMPT_TEMPLATES[d.axis];
    return {
      id: `da_fallback_${top1.key}_${top2.key}_${i}`,
      prompt: tmpl.prompt,
      a: { label: tmpl.a, loading: aVec },
      b: { label: tmpl.b, loading: bVec },
      kind: "disambiguator",
    };
  });
}

/** Return a 7-vector with `value` at `idx` and zero elsewhere. */
function oneHot(idx: number, value: number): Vector7 {
  const v = new Array(AXES.length).fill(0);
  v[idx] = value;
  return v;
}

/**
 * Wording for each axis when synthesizing a fallback probe. Option `a` is
 * pole-positive ("toward second pole of the axis name"), option `b` is
 * pole-negative. The `synthesizeFallback` helper flips the loadings when
 * the centroid diff for that axis is negative.
 */
const AXIS_PROMPT_TEMPLATES: Record<AxisKey, { prompt: string; a: string; b: string }> = {
  prestigePopcorn: {
    prompt: "Honest tonight pick.",
    a: "Something everyone's seen.",
    b: "Something nobody's heard of.",
  },
  modernClassic: {
    prompt: "When in doubt.",
    a: "Made this decade.",
    b: "Older than me.",
  },
  lightDark: {
    prompt: "Pick your room.",
    a: "Lights on, snacks out.",
    b: "Lights off, leave me alone.",
  },
  realityFantasy: {
    prompt: "Where should the camera point?",
    a: "At a real apartment.",
    b: "At a world that doesn't exist.",
  },
  slowKinetic: {
    prompt: "Pacing.",
    a: "Let it breathe.",
    b: "Keep it moving.",
  },
  soloCommunal: {
    prompt: "Watching with…",
    a: "Just me.",
    b: "Friends, loud.",
  },
  familiarForeign: {
    prompt: "Subtitles?",
    a: "Don't make me read.",
    b: "Subs are fine, bring it on.",
  },
};

/**
 * Truly-generic three-question fallback for callers that pass no archetypes.
 * Each one loads on a single axis with magnitude 1. The IDs are stable.
 */
const GENERIC_FALLBACK: Question[] = [
  {
    id: "da_generic_lightDark",
    prompt: AXIS_PROMPT_TEMPLATES.lightDark.prompt,
    a: { label: AXIS_PROMPT_TEMPLATES.lightDark.a, loading: oneHot(2, -1) },
    b: { label: AXIS_PROMPT_TEMPLATES.lightDark.b, loading: oneHot(2, 1) },
    kind: "disambiguator",
  },
  {
    id: "da_generic_slowKinetic",
    prompt: AXIS_PROMPT_TEMPLATES.slowKinetic.prompt,
    a: { label: AXIS_PROMPT_TEMPLATES.slowKinetic.a, loading: oneHot(4, -1) },
    b: { label: AXIS_PROMPT_TEMPLATES.slowKinetic.b, loading: oneHot(4, 1) },
    kind: "disambiguator",
  },
  {
    id: "da_generic_realityFantasy",
    prompt: AXIS_PROMPT_TEMPLATES.realityFantasy.prompt,
    a: { label: AXIS_PROMPT_TEMPLATES.realityFantasy.a, loading: oneHot(3, -1) },
    b: { label: AXIS_PROMPT_TEMPLATES.realityFantasy.b, loading: oneHot(3, 1) },
    kind: "disambiguator",
  },
];
