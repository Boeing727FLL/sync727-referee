import type { Transition } from 'framer-motion';

/** Shared motion language: quick controls, settled content, and interruption-safe overlays. */
export const MOTION = {
  tap: { type: 'spring', stiffness: 600, damping: 38, mass: 0.5 } satisfies Transition,
  control: { type: 'spring', stiffness: 460, damping: 34, mass: 0.62 } satisfies Transition,
  content: { type: 'spring', stiffness: 320, damping: 31, mass: 0.72 } satisfies Transition,
  gentle: { type: 'spring', stiffness: 240, damping: 27, mass: 0.82 } satisfies Transition,
  overlay: { type: 'spring', stiffness: 400, damping: 34, mass: 0.7 } satisfies Transition,
  fade: { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] } satisfies Transition,
} as const;
