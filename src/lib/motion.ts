// Shared motion vocabulary. Match CSS vars in globals.css.
import type { Transition } from "motion/react";

export const dur = {
  instant: 0.08,
  quick: 0.16,
  regular: 0.28,
  scenic: 0.52,
} as const;

export const ease = {
  standard: [0.2, 0.7, 0.2, 1] as const,
  entrance: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
};

export const springSnap: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 28,
  mass: 0.7,
};

export const springSoft: Transition = {
  type: "spring",
  stiffness: 240,
  damping: 26,
  mass: 0.9,
};
