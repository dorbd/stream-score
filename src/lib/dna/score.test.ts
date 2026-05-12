// Smoke tests for the DNA scoring engine.
// Run with: npx tsx src/lib/dna/score.test.ts
//
// Uses node's built-in `assert` so we don't need vitest/jest.
// Keep this file small and fast — these are sanity tests, not fixtures.

import assert from "node:assert/strict";
import { computeVector, cosineSim, l2, VECTOR_DIM, zeroVector } from "./score";
import { assignArchetype } from "./archetype";
import { detectLie } from "./lieDetector";
import { pickDisambiguators, pairKey } from "./adaptive";
import type { Answers, Archetype, DisambiguatorBank, Loadings } from "./types";
import { AXES } from "./types";

const FIXTURE_LOADINGS: Loadings = {
  axes: AXES,
  loadings: {
    // q1 loads strongly on prestigePopcorn (idx 0)
    q1: { a: [+1, 0, 0, 0, 0, 0, 0], b: [-1, 0, 0, 0, 0, 0, 0] },
    // q2 loads on lightDark (idx 2)
    q2: { a: [0, 0, +1, 0, 0, 0, 0], b: [0, 0, -1, 0, 0, 0, 0] },
    // Q6 / Q12 — the lie-detector pair. Match spec polarity.
    // Q6.a = Slow +1.2  (slowKinetic idx 4 negative = slow)
    // Q6.b = Kinetic +1.0
    q6: { a: [0, 0, 0, 0, -1.2, 0, 0], b: [0, 0, 0, 0, +1.0, 0, 0] },
    // Q12.a = Kinetic +1.1
    // Q12.b = Slow +1.1
    q12: { a: [0, 0, 0, 0, +1.1, 0, 0], b: [0, 0, 0, 0, -1.1, 0, 0] },
  },
};

const FIXTURE_ARCHETYPES: Archetype[] = [
  {
    key: "popcorn_bright",
    name: "Popcorn Bright",
    tagline: "Lights on, big smiles.",
    anchorFilm: { title: "Paddington 2", tmdbId: 346648, year: 2017 },
    anchorDirector: "Paul King",
    centroid: [-1, 0, -1, 0, 0, +1, 0],
  },
  {
    key: "prestige_dark",
    name: "Prestige Dark",
    tagline: "Lights off, leave me alone.",
    anchorFilm: { title: "There Will Be Blood", tmdbId: 7345, year: 2007 },
    anchorDirector: "Paul Thomas Anderson",
    centroid: [+1, 0, +1, 0, -1, -1, 0],
  },
  {
    key: "slow_burn_romantic",
    name: "Slow-Burn Romantic",
    tagline: "Two people, one long look.",
    anchorFilm: { title: "In the Mood for Love", tmdbId: 843, year: 2000 },
    anchorDirector: "Wong Kar-wai",
    centroid: [+0.5, 0, 0, +0.5, -1, 0, +1],
  },
];

// ---------------------------------------------------------------------------
// score.ts
// ---------------------------------------------------------------------------

(function testZeroAndUnitMath() {
  const z = zeroVector();
  assert.equal(z.length, VECTOR_DIM, "zero vector has 7 components");
  assert.equal(l2(z), 0, "L2 of zero is 0");
  assert.equal(cosineSim(z, z), 0, "cosine of zero is 0 (safe)");
  assert.equal(cosineSim([1, 0, 0, 0, 0, 0, 0], [2, 0, 0, 0, 0, 0, 0]), 1);
  console.log("ok: zero/L2/cosine math");
})();

(function testEmptyAnswers() {
  const v = computeVector({}, { loadings: FIXTURE_LOADINGS });
  assert.deepEqual(v, zeroVector(), "empty answers → zero vector");
  console.log("ok: empty answers → zero vector");
})();

(function testSkipContributesZero() {
  const v = computeVector(
    { q1: "skip", q2: "skip" } as Answers,
    { loadings: FIXTURE_LOADINGS },
  );
  assert.deepEqual(v, zeroVector(), "all skips → zero vector");
  console.log("ok: skips contribute zero");
})();

(function testSingleAnswerDirection() {
  // Answering q1=a should push axis 0 positive.
  const v = computeVector({ q1: "a" } as Answers, { loadings: FIXTURE_LOADINGS });
  assert.ok(v[0] > 0, `axis 0 positive after q1=a (got ${v[0]})`);
  assert.ok(
    Math.abs(l2(v) - 1) < 1e-9,
    "final vector is L2-normalized to unit length",
  );
  console.log("ok: single-answer direction + unit norm");
})();

(function testLieDownweight() {
  // Without lie flag.
  const baseline = computeVector(
    { q1: "a", q2: "a" } as Answers,
    { loadings: FIXTURE_LOADINGS },
  );
  // With lie flag — final is still unit-normalized, so scaling before
  // normalization should produce the SAME unit vector (downweight is a
  // uniform scale). This verifies the downweight is applied to the pre-
  // normalize sum, i.e. doesn't change direction. Direction-changing checks
  // belong to integration tests with TV loading.
  const lied = computeVector(
    { q1: "a", q2: "a" } as Answers,
    {
      loadings: FIXTURE_LOADINGS,
      lieDetectorFlags: { detected: true, downweight: 0.6 },
    },
  );
  for (let i = 0; i < VECTOR_DIM; i++) {
    assert.ok(
      Math.abs(baseline[i] - lied[i]) < 1e-9,
      `lie downweight preserves direction at axis ${i}`,
    );
  }
  console.log("ok: lie downweight preserves direction (uniform scale)");
})();

(function testTvLoadingShiftsResult() {
  const without = computeVector(
    { q1: "a" } as Answers,
    { loadings: FIXTURE_LOADINGS },
  );
  const with_ = computeVector(
    { q1: "a" } as Answers,
    {
      loadings: FIXTURE_LOADINGS,
      tvLoading: [0, 0, 0, +1, 0, 0, 0], // push realityFantasy positive
    },
  );
  assert.ok(with_[3] > without[3], "TV loading nudges axis 3 positive");
  console.log("ok: tvLoading shifts result");
})();

(function testClampPreventsRunaway() {
  // Build an answer that would yield an enormous value on axis 0 if unclamped.
  const big: Loadings = {
    axes: AXES,
    loadings: {
      q1: { a: [+99, 0, 0, 0, 0, 0, 0], b: [-99, 0, 0, 0, 0, 0, 0] },
    },
  };
  const v = computeVector({ q1: "a" } as Answers, { loadings: big });
  // After unit-normalize the axis-0 component should be ≈1 (not 99).
  assert.ok(
    Math.abs(v[0] - 1) < 1e-9 && Math.abs(l2(v) - 1) < 1e-9,
    `clamp+normalize tames runaway loading (got ${v.join(",")})`,
  );
  console.log("ok: clamp prevents runaway");
})();

// ---------------------------------------------------------------------------
// lieDetector.ts
// ---------------------------------------------------------------------------

(function testLieDetector() {
  assert.deepEqual(detectLie({}), { detected: false, downweight: 1.0 });
  assert.deepEqual(detectLie({ q6: "a" }), { detected: false, downweight: 1.0 });
  assert.deepEqual(
    detectLie({ q6: "a", q12: "b" }),
    { detected: false, downweight: 1.0 },
    "consistent answers (q6=a, q12=b) → no lie",
  );
  assert.deepEqual(
    detectLie({ q6: "b", q12: "a" }),
    { detected: false, downweight: 1.0 },
    "consistent answers (q6=b, q12=a) → no lie",
  );
  const lied = detectLie({ q6: "a", q12: "a" });
  assert.equal(lied.detected, true, "matching letters → contradiction");
  assert.ok(lied.downweight < 1, "lie downweight < 1");
  assert.deepEqual(
    detectLie({ q6: "skip", q12: "a" }),
    { detected: false, downweight: 1.0 },
    "skip → no lie",
  );
  console.log("ok: lie detector all paths");
})();

// ---------------------------------------------------------------------------
// archetype.ts
// ---------------------------------------------------------------------------

(function testArchetypeAssignment() {
  // A user who answers "lights off, prestige" should land near prestige_dark.
  const answers: Answers = { q1: "a", q2: "a" }; // q1.a → +prestige, q2.a → +dark
  const v = computeVector(answers, { loadings: FIXTURE_LOADINGS });
  const result = assignArchetype(v, FIXTURE_ARCHETYPES);
  assert.equal(
    result.top1.key,
    "prestige_dark",
    `expected prestige_dark, got ${result.top1.key}`,
  );
  assert.equal(result.topN.length, 3, "topN returns all archetypes");
  assert.ok(
    result.topN[0].score >= result.topN[1].score,
    "topN sorted descending",
  );
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
  console.log(
    `ok: archetype assignment → ${result.top1.key} (conf ${result.confidence.toFixed(2)})`,
  );
})();

(function testLowSignalFlag() {
  const v = computeVector({}, { loadings: FIXTURE_LOADINGS });
  const high = assignArchetype(v, FIXTURE_ARCHETYPES, { skipCount: 15 });
  assert.equal(high.lowSignal, true, "15 skips → lowSignal");
  const low = assignArchetype(v, FIXTURE_ARCHETYPES, { skipCount: 5 });
  assert.equal(low.lowSignal, undefined, "5 skips → not flagged");
  console.log("ok: low-signal flag");
})();

// ---------------------------------------------------------------------------
// adaptive.ts
// ---------------------------------------------------------------------------

(function testDisambiguatorPicker() {
  const bank: DisambiguatorBank = {
    [pairKey("popcorn_bright", "prestige_dark")]: {
      questions: [
        {
          prompt: "Tonight, you'd rather:",
          a: { label: "Laugh", loading: [-1, 0, -0.5, 0, 0, 0, 0] },
          b: { label: "Wince", loading: [+1, 0, +0.5, 0, 0, 0, 0] },
        },
        {
          prompt: "Couch state:",
          a: { label: "Lights on", loading: [0, 0, -1, 0, 0, 0, 0] },
          b: { label: "Lights off", loading: [0, 0, +1, 0, 0, 0, 0] },
        },
        {
          prompt: "Length:",
          a: { label: "90 min", loading: [0, 0, 0, 0, +0.5, 0, 0] },
          b: { label: "3 hours", loading: [0, 0, 0, 0, -0.5, 0, 0] },
        },
      ],
    },
  };

  // Curated path.
  const curated = pickDisambiguators(
    "popcorn_bright",
    "prestige_dark",
    bank,
    3,
  );
  assert.equal(curated.length, 3, "curated returns 3");
  assert.ok(curated[0].id.startsWith("da_"), "id is da_-prefixed");

  // Sorted-pair-key resilience: swapping order finds the same entry.
  const swapped = pickDisambiguators(
    "prestige_dark",
    "popcorn_bright",
    bank,
    3,
  );
  assert.equal(swapped[0].prompt, curated[0].prompt, "pair key is order-insensitive");

  // Synthesized fallback path: pair is missing from bank.
  const fallback = pickDisambiguators(
    "popcorn_bright",
    "slow_burn_romantic",
    bank,
    3,
    FIXTURE_ARCHETYPES,
  );
  assert.equal(fallback.length, 3, "fallback returns 3");
  // Each fallback question should load on exactly one axis with ±1.
  for (const q of fallback) {
    const nonZeroA = q.a.loading.filter((x) => x !== 0).length;
    const nonZeroB = q.b.loading.filter((x) => x !== 0).length;
    assert.equal(nonZeroA, 1, "fallback option a is one-hot");
    assert.equal(nonZeroB, 1, "fallback option b is one-hot");
  }

  // Generic fallback: no centroids, missing pair.
  const generic = pickDisambiguators("__missing__", "__also_missing__", {}, 3);
  assert.equal(generic.length, 3, "generic fallback returns 3");

  console.log("ok: disambiguator picker (curated/synth/generic)");
})();

console.log("\nAll DNA scoring tests passed.");
