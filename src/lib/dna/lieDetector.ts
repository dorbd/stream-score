// Q6 ↔ Q12 reconciliation.
//
// Q6 and Q12 are intentionally duplicated with REVERSE polarity so we can
// catch users who are clicking aspirationally rather than honestly. The
// canonical mapping (per the design spec):
//
//   Q6.a  "In. That's usually where the good ones live."  →  Slow  + 1.2
//   Q6.b  "Pass. Life's short."                            →  Kinetic + 1.0
//   Q12.a "Restless"                                       →  Kinetic + 1.1
//   Q12.b "Settled in"                                     →  Slow  + 1.1
//
// CONSISTENT: (q6=a ∧ q12=b)  OR  (q6=b ∧ q12=a)
// CONTRADICTION: (q6=a ∧ q12=a)  OR  (q6=b ∧ q12=b)
//
// If either answer is missing or `"skip"`, we cannot conclude anything — so
// we treat it as not-detected (i.e. trust the user). Detection produces a
// downweight (default 0.6) applied to the final taste vector to soften the
// signal of a likely-aspirational respondent.

import type { Answers, LieDetectorFlags } from "./types";

/** IDs the lie detector reconciles. Centralized so the question bank can pin them. */
export const LIE_DETECTOR_PAIR = { primary: "q6", reverse: "q12" } as const;

/** Default downweight applied when a contradiction is detected. */
export const LIE_DOWNWEIGHT = 0.6;

/**
 * Reconcile the primary question (Q6) against its reverse-polarity dup (Q12)
 * and return a flag plus a downweight multiplier for the final vector.
 *
 * @param answers - All collected answers; only q6/q12 are inspected.
 * @returns `{ detected, downweight }`. `downweight` is 1.0 when not detected.
 */
export function detectLie(answers: Answers): LieDetectorFlags {
  const q6 = answers[LIE_DETECTOR_PAIR.primary];
  const q12 = answers[LIE_DETECTOR_PAIR.reverse];

  // Cannot decide without both real answers.
  if (!q6 || !q12 || q6 === "skip" || q12 === "skip") {
    return { detected: false, downweight: 1.0 };
  }

  // Contradiction: matching letters mean the user picked opposite poles
  // because Q12 is reverse-coded relative to Q6.
  const detected = (q6 === "a" && q12 === "a") || (q6 === "b" && q12 === "b");
  return {
    detected,
    downweight: detected ? LIE_DOWNWEIGHT : 1.0,
  };
}
