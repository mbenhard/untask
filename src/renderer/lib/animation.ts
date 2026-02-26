import type { Transition, Variants } from 'framer-motion';

// --- Timing ---

export const SNAPPY: Transition = {
  duration: 0.12,
  ease: [0.25, 0.1, 0.25, 1],
};

export const SNAPPY_SPRING: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 30,
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
