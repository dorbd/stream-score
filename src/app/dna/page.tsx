"use client";

// /dna — the quiz runner. Mobile-first, single-question-per-screen.
//
// Flow:
//   1. Splash ("90 seconds. Better picks tonight.") — skip with ?immediate=1
//   2. Q1..Q18 from data/dna/questions.json
//   3. After Q18, computeVector + assignArchetype + pickDisambiguators → Q19..Q21
//   4. Q18 is special: free-text TV input with skip; on skip we pull 1 extra
//      disambiguator so the user still answers 21 total.
//   5. After Q21, writeStoredDna() then router.push(`/dna/${archetypeKey}`).

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import questionsData from "../../../data/dna/questions.json";
import archetypesData from "../../../data/dna/archetypes.json";
import loadingsData from "../../../data/dna/loadings.json";
import disambiguatorsData from "../../../data/dna/disambiguators.json";
import { computeVector } from "@/lib/dna/score";
import { assignArchetype } from "@/lib/dna/archetype";
import { pickDisambiguators } from "@/lib/dna/adaptive";
import { writeStoredDna, pickVoice } from "@/lib/dna/storage";
import type {
  Archetype,
  Answers,
  DisambiguatorBank,
  Loadings,
  Question as ScoreQuestion,
} from "@/lib/dna/types";
import { QuestionCard } from "@/components/dna/QuestionCard";
import { StillPair } from "@/components/dna/StillPair";
import { ProgressDots } from "@/components/dna/ProgressDots";
import { dur, ease } from "@/lib/motion";
import { cn } from "@/lib/cn";

// ── Types for the prompt-bank JSON (Agent 1's wire format) ─────────────────
// Agent 1's `questions.json` has a richer UI shape than the runtime
// scoring-engine `Question` type (which only carries loadings). We keep them
// distinct: `PromptQuestion` is for rendering, scoring-engine `Question`s
// (returned by pickDisambiguators) get rendered with the same QuestionCard
// but without subtitle / still.
type QuestionKind = "movie_pair" | "general" | "aesthetic" | "tv_optional" | "lie_detector";

interface PromptOption {
  label: string;
  subtitle?: string;
  still?: { description: string; colorHint: string };
  posterUrl?: string;
  dominantColor?: string;
}

interface PromptQuestion {
  id: string;
  kind: QuestionKind;
  prompt: string;
  a: PromptOption;
  b: PromptOption;
  duplicateOf?: string | null;
}

type Answer = "a" | "b" | "skip";

const TOTAL_QUESTIONS = 21;
const FIXED_COUNT = 18;

const PROMPTS: PromptQuestion[] = questionsData as unknown as PromptQuestion[];
const ARCHETYPES = archetypesData as unknown as Archetype[];
const LOADINGS = loadingsData as unknown as Loadings;
// disambiguators.json wraps the bank in `pairs`. adaptive.ts wants a flat record.
const BANK: DisambiguatorBank =
  (disambiguatorsData as unknown as { pairs: DisambiguatorBank }).pairs ?? {};

const KIND_LABEL: Record<QuestionKind, string> = {
  movie_pair: "Films",
  general: "Sensibility",
  aesthetic: "Aesthetic",
  tv_optional: "Television",
  lie_detector: "Calibration",
};

// Union: prompt-bank question (richer UI) OR scoring-engine question (loading-only).
type AnyQuestion =
  | { source: "prompt"; q: PromptQuestion }
  | { source: "score"; q: ScoreQuestion };

export default function DnaPage() {
  return (
    <Suspense fallback={<QuizShell />}>
      <DnaQuiz />
    </Suspense>
  );
}

function DnaQuiz() {
  const router = useRouter();
  const search = useSearchParams();
  const reduce = useReducedMotion();

  const immediate = search.get("immediate") === "1";

  // "splash" → "running" → "submitting"
  const [phase, setPhase] = useState<"splash" | "running" | "submitting">(
    immediate ? "running" : "splash",
  );
  const [step, setStep] = useState(0); // 0-based index into the active question queue
  const [answers, setAnswers] = useState<Answers>({});
  const [tvTitle, setTvTitle] = useState<string>("");
  // Disambiguators loaded after Q18. We also stash an injected loadings map for
  // them so computeVector can score them on the final pass.
  const [disambigs, setDisambigs] = useState<ScoreQuestion[] | null>(null);
  // Per-question response time logger (ms). Lazy-init so we don't call the
  // impure `performance.now()` during render.
  const startedAtRef = useRef<number | null>(null);
  const responseTimesRef = useRef<Record<string, number>>({});

  // Merge fixed prompts + dynamic disambiguators into a single queue.
  const queue: AnyQuestion[] = useMemo(() => {
    const fixed: AnyQuestion[] = PROMPTS.slice(0, FIXED_COUNT).map((q) => ({
      source: "prompt",
      q,
    }));
    if (!disambigs) return fixed;
    return [
      ...fixed,
      ...disambigs.map<AnyQuestion>((q) => ({ source: "score", q })),
    ];
  }, [disambigs]);

  const currentEntry = queue[step];
  const answeredCount = Object.keys(answers).length;

  // Merge runtime-only loadings (for disambiguator questions) into a copy of the
  // base loadings file. Disambiguator questions ship their own loadings inline;
  // the score module only knows about the static map.
  const effectiveLoadings: Loadings = useMemo(() => {
    if (!disambigs) return LOADINGS;
    const extra: Record<string, { a: number[]; b: number[] }> = {};
    for (const q of disambigs) {
      extra[q.id] = { a: q.a.loading, b: q.b.loading };
    }
    return {
      ...LOADINGS,
      loadings: { ...LOADINGS.loadings, ...extra },
    };
  }, [disambigs]);

  // After Q18 (index 17) completes, compute vector + load disambiguators.
  // Returns the loaded list (possibly empty). Caller decides whether to
  // advance to the first disambiguator or finish immediately.
  const loadDisambiguators = useCallback(
    (currentAnswers: Answers, tvSkipped: boolean): ScoreQuestion[] => {
      try {
        const vector = computeVector(currentAnswers, { loadings: LOADINGS });
        const { top1, top2 } = assignArchetype(vector, ARCHETYPES);
        const picks = pickDisambiguators(top1.key, top2.key, BANK, 3, ARCHETYPES);
        let expanded: ScoreQuestion[] = picks;
        if (tvSkipped) {
          const bankEntry = BANK[[top1.key, top2.key].sort().join("|")];
          if (bankEntry && bankEntry.questions.length >= 4) {
            const fourth = bankEntry.questions[3];
            expanded = [
              ...picks,
              {
                id: `da_${[top1.key, top2.key].sort().join("|")}_3`,
                prompt: fourth.prompt,
                a: fourth.a,
                b: fourth.b,
                kind: "disambiguator",
              },
            ];
          } else if (picks.length >= 1) {
            // Clone the most useful pick (#0) with a new id so the score engine
            // treats it as a separate answer — adds one extra question to
            // compensate for the skipped TV one.
            const seed = picks[0];
            expanded = [...picks, { ...seed, id: `${seed.id}_x` }];
          }
        }
        setDisambigs(expanded);
        return expanded;
      } catch (err) {
        console.error("[dna] failed to load disambiguators", err);
        setDisambigs([]);
        return [];
      }
    },
    [],
  );

  // Finalize: write DNA, redirect to reveal.
  const finish = useCallback(
    (finalAnswers: Answers) => {
      setPhase("submitting");
      try {
        const vector = computeVector(finalAnswers, { loadings: effectiveLoadings });
        const skipCount = Object.values(finalAnswers).filter((a) => a === "skip").length;
        const { top1, top2, confidence } = assignArchetype(vector, ARCHETYPES, {
          skipCount,
        });
        const voiceVariant = pickVoice(vector, top1.key);
        writeStoredDna({
          v: 1,
          vector,
          archetype: top1.key,
          secondaryArchetype: top2.key !== top1.key ? top2.key : null,
          confidence,
          voiceVariant,
          answers: finalAnswers,
          createdAt: Date.now(),
          responseTimesMs: Object.values(responseTimesRef.current),
        });
        router.push(`/dna/${top1.key}`);
      } catch (err) {
        console.error("[dna] failed to finalize", err);
        setPhase("running");
      }
    },
    [effectiveLoadings, router],
  );

  const recordResponseTime = useCallback((questionId: string) => {
    const now = performance.now();
    const startedAt = startedAtRef.current ?? now;
    responseTimesRef.current[questionId] = now - startedAt;
    startedAtRef.current = now;
  }, []);

  const advance = useCallback(
    (nextAnswers: Answers, tvSkipped: boolean) => {
      const nextStep = step + 1;
      // Just finished the fixed run — load disambiguators inline.
      if (nextStep === FIXED_COUNT && !disambigs) {
        const loaded = loadDisambiguators(nextAnswers, tvSkipped);
        if (loaded.length === 0) {
          // Bank failed — finish with the 18 answers we have.
          finish(nextAnswers);
          return;
        }
        setStep(nextStep);
        return;
      }
      if (nextStep >= queue.length) {
        finish(nextAnswers);
        return;
      }
      setStep(nextStep);
    },
    [step, queue.length, disambigs, finish, loadDisambiguators],
  );

  const currentId =
    currentEntry?.source === "prompt" ? currentEntry.q.id : currentEntry?.q.id;

  const pick = useCallback(
    (choice: Answer) => {
      if (!currentEntry || !currentId) return;
      recordResponseTime(currentId);
      const next = { ...answers, [currentId]: choice };
      setAnswers(next);
      advance(next, false);
    },
    [answers, advance, currentEntry, currentId, recordResponseTime],
  );

  // Q18 specific: TV title commit
  const commitTvTitle = useCallback(
    (skipped: boolean) => {
      if (!currentEntry || !currentId) return;
      recordResponseTime(currentId);
      // The score module's Q18 loading covers both poles; if user engaged we
      // treat as "a", if they skipped we record "skip" so scoring zeroes it.
      const ans: Answer = skipped ? "skip" : "a";
      const next = { ...answers, [currentId]: ans };
      setAnswers(next);
      advance(next, skipped);
    },
    [advance, answers, currentEntry, currentId, recordResponseTime],
  );

  // Keyboard shortcuts: A / B / S during run phase.
  useEffect(() => {
    if (phase !== "running" || !currentEntry) return;
    const isTv =
      currentEntry.source === "prompt" && currentEntry.q.kind === "tv_optional";
    if (isTv) return; // don't hijack typing
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const k = e.key.toLowerCase();
      if (k === "a" || k === "arrowleft") {
        e.preventDefault();
        pick("a");
      } else if (k === "b" || k === "arrowright") {
        e.preventDefault();
        pick("b");
      } else if (k === "s") {
        e.preventDefault();
        pick("skip");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, currentEntry, pick]);

  // Reset start-clock when the question changes (and on first run).
  useEffect(() => {
    if (phase !== "running") return;
    startedAtRef.current = performance.now();
  }, [step, phase]);


  // ─────────────────── render ───────────────────

  if (phase === "splash") {
    return <Splash onStart={() => setPhase("running")} />;
  }

  if (phase === "submitting" || !currentEntry) {
    return <Submitting />;
  }

  return (
    <div className="flex min-h-[calc(100vh-180px)] flex-col items-center justify-between gap-10 py-8 sm:py-12">
      <ProgressDots
        total={TOTAL_QUESTIONS}
        current={step}
        answered={answeredCount}
        className="px-2"
      />

      <div className="flex w-full flex-1 items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentId}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: dur.quick, ease: ease.standard }}
            className="flex w-full justify-center"
          >
            {currentEntry.source === "score" ? (
              <QuestionCard
                prompt={currentEntry.q.prompt}
                index={step + 1}
                total={TOTAL_QUESTIONS}
                kindLabel="Calibration"
                a={{ label: currentEntry.q.a.label }}
                b={{ label: currentEntry.q.b.label }}
                onPick={pick}
                onSkip={() => pick("skip")}
                skipLabel="Skip"
              />
            ) : currentEntry.q.kind === "aesthetic" ? (
              <StillPair
                prompt={currentEntry.q.prompt}
                index={step + 1}
                total={TOTAL_QUESTIONS}
                kindLabel={KIND_LABEL[currentEntry.q.kind]}
                a={currentEntry.q.a}
                b={currentEntry.q.b}
                onPick={pick}
                onSkip={() => pick("skip")}
              />
            ) : currentEntry.q.kind === "tv_optional" ? (
              <TvOptionalCard
                prompt={currentEntry.q.prompt}
                index={step + 1}
                total={TOTAL_QUESTIONS}
                value={tvTitle}
                onChange={setTvTitle}
                onCommit={() => commitTvTitle(false)}
                onSkip={() => {
                  setTvTitle("");
                  commitTvTitle(true);
                }}
              />
            ) : (
              <QuestionCard
                prompt={currentEntry.q.prompt}
                index={step + 1}
                total={TOTAL_QUESTIONS}
                kindLabel={KIND_LABEL[currentEntry.q.kind]}
                a={currentEntry.q.a}
                b={currentEntry.q.b}
                onPick={pick}
                onSkip={() => pick("skip")}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="num-prose text-[10px] uppercase tracking-[0.22em] text-[var(--color-subtle)]">
        Keyboard: A · B · S to skip
      </div>
    </div>
  );
}

// ─────────────────── splash ───────────────────

function Splash({ onStart }: { onStart: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.scenic, ease: ease.entrance }}
      className="mx-auto flex min-h-[calc(100vh-180px)] max-w-2xl flex-col items-center justify-center gap-8 py-10 text-center"
    >
      <span
        aria-hidden
        className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
      >
        <Sparkles className="h-6 w-6" />
      </span>
      <div className="space-y-4">
        <p className="num-prose text-[11px] uppercase tracking-[0.22em] text-[var(--color-subtle)]">
          stream·score DNA
        </p>
        <h1 className="font-display text-balance text-[44px] leading-[0.95] text-[var(--color-text)] sm:text-[68px]">
          90 seconds.{" "}
          <span className="italic text-[var(--color-accent)]">Better picks</span> tonight.
        </h1>
        <p className="mx-auto max-w-md text-[15px] text-[var(--color-muted)] sm:text-[16px]">
          Twenty-one quick gut checks. No accounts. No tracking. The result re-ranks
          every feed you see on stream·score.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-6 py-3 text-[15px] font-medium text-black/90 transition hover:brightness-110"
        >
          Start
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
        <Link
          href="/"
          className="text-[13px] text-[var(--color-subtle)] underline-offset-4 hover:text-[var(--color-muted)] hover:underline"
        >
          Maybe later
        </Link>
      </div>
    </motion.section>
  );
}

// ─────────────────── TV optional (Q18) ───────────────────

function TvOptionalCard({
  prompt,
  index,
  total,
  value,
  onChange,
  onCommit,
  onSkip,
}: {
  prompt: string;
  index: number;
  total: number;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onSkip: () => void;
}) {
  const reduce = useReducedMotion();
  const trimmed = value.trim();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: dur.regular, ease: ease.entrance }}
      className="flex w-full max-w-xl flex-col items-center gap-8"
    >
      <div className="space-y-3 text-center">
        <div className="num-prose flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[var(--color-subtle)]">
          <span>
            Question {index} of {total}
          </span>
          <span aria-hidden>·</span>
          <span className="text-[var(--color-accent)]/80">Television</span>
        </div>
        <h2 className="font-display text-balance text-[28px] leading-[1.05] text-[var(--color-text)] sm:text-[36px]">
          {prompt}
        </h2>
      </div>

      <form
        className="flex w-full flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) onCommit();
        }}
      >
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          autoComplete="off"
          placeholder="e.g. The Bear, Severance, Mad Men…"
          className={cn(
            "w-full rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
            "px-5 py-4 text-[16px] text-[var(--color-text)] placeholder:text-[var(--color-subtle)]",
            "transition focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]",
          )}
        />
        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onSkip}
            className="text-[13px] text-[var(--color-subtle)] underline-offset-4 transition hover:text-[var(--color-muted)] hover:underline"
          >
            Skip — I&apos;m here for movies
          </button>
          <button
            type="submit"
            disabled={!trimmed}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium transition",
              trimmed
                ? "bg-[var(--color-accent)] text-black/90 hover:brightness-110"
                : "cursor-not-allowed bg-[var(--color-surface)] text-[var(--color-subtle)]",
            )}
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ─────────────────── shell + submitting ───────────────────

function QuizShell() {
  return (
    <div className="flex min-h-[calc(100vh-180px)] items-center justify-center">
      <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
    </div>
  );
}

function Submitting() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: dur.regular }}
      className="flex min-h-[calc(100vh-180px)] flex-col items-center justify-center gap-4 text-center"
    >
      <span
        aria-hidden
        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
      >
        <Sparkles className="h-5 w-5 bulb-pulse" />
      </span>
      <p className="font-display text-[28px] leading-tight text-[var(--color-text)]">
        Reading your taste…
      </p>
      <p className="text-[13px] text-[var(--color-muted)]">A second. No more.</p>
    </motion.div>
  );
}
