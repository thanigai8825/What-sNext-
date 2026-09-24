import type { Transition, Variants } from 'motion/react'

/** Apple's sheet curve. Everything that isn't a spring uses it. */
export const ease = [0.32, 0.72, 0, 1] as const

export const tFast: Transition = { duration: 0.2, ease }
export const tBase: Transition = { duration: 0.28, ease }
export const tSlow: Transition = { duration: 0.35, ease }

/** Critically damped: settles without overshoot. For layout and position. */
export const spring: Transition = { type: 'spring', duration: 0.35, bounce: 0 }
/** A touch of life. For things that arrive: checkmarks, pills, rewards. */
export const springPop: Transition = { type: 'spring', duration: 0.45, bounce: 0.28 }
/** Slower settle for progress fills, so the eye can follow the gain. */
export const springFill: Transition = { type: 'spring', duration: 0.9, bounce: 0.05 }

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: tBase },
  exit: { opacity: 0, y: -4, transition: tFast },
}

export const stagger = (i: number, step = 0.04, base = 0) => ({ ...tBase, delay: base + i * step })
