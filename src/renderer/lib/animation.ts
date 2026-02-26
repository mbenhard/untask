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

// --- Onboarding (virtual-scroll architecture) ---

/**
 * Main scroll transition — applied to the tall column container.
 * Smooth ease-in-out for a polished, scroll-like feel.
 */
export const ONBOARDING_SCROLL_TRANSITION: Transition = {
  duration: 0.7,
  ease: [0.45, 0, 0.15, 1],
};

/**
 * Stagger container — apply to a wrapper around cards.
 * Only triggers when isActive becomes true (controlled by animate prop).
 */
export const onboardingStaggerContainer: Variants = {
  enter: {},
  center: {
    transition: {
      staggerChildren: 0,
      delayChildren: 0,
    },
  },
};

/** Individual card entrance — children of the stagger container. */
export const onboardingCardVariants: Variants = {
  enter: { opacity: 1, y: 0 },
  center: {
    opacity: 1,
    y: 0,
    transition: { duration: 0, ease: 'linear' },
  },
};
