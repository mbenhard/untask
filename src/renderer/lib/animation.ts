import type { Transition, Variants } from 'framer-motion';

// --- Timing ---

export const SNAPPY: Transition = {
  duration: 0.12,
  ease: [0.25, 0.1, 0.25, 1],
};

export const PILL_SLIDE: Transition = {
  type: 'tween',
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1],
};

// --- Variants ---

export const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const heightVariants: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
};

export const scaleVariants: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};

// --- Onboarding ---

export const ONBOARDING_TRANSITION: Transition = {
  duration: 0.25,
  ease: [0.25, 0.1, 0.25, 1],
};

export const ONBOARDING_HEADER_TRANSITION: Transition = {
  duration: 0.15,
  ease: [0.25, 0.1, 0.25, 1],
};

/** Direction-aware step variants. `custom` = 1 (forward) or -1 (backward). */
export const onboardingStepVariants: Variants = {
  enter: (direction: number) => ({
    opacity: 0,
    y: direction > 0 ? 20 : -20,
  }),
  center: {
    opacity: 1,
    y: 0,
  },
  exit: (direction: number) => ({
    opacity: 0,
    y: direction > 0 ? -20 : 20,
  }),
};

export const onboardingHeaderVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

/** Stagger container — apply to a wrapper around cards. */
export const onboardingStaggerContainer: Variants = {
  enter: {},
  center: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

/** Individual card entrance — children of the stagger container. */
export const onboardingCardVariants: Variants = {
  enter: { opacity: 0, y: 12 },
  center: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
};
