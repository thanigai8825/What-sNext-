import { motion } from 'motion/react'
import { ease } from '../lib/motion'
import { cn } from '../lib/cn'

/** A checkmark that draws itself: circle first, then the tick. */
export function Checkmark({ size = 72, delay = 0, className }: { size?: number; delay?: number; className?: string }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 72 72"
      fill="none"
      className={cn('text-sage', className)}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', duration: 0.5, bounce: 0.35, delay }}
      aria-hidden
    >
      <motion.circle
        cx="36"
        cy="36"
        r="33"
        className="fill-sage-bg"
        stroke="currentColor"
        strokeWidth="2"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease, delay }}
        style={{ rotate: -90, transformOrigin: '50% 50%' }}
      />
      <motion.path
        d="M22.5 37.5 L31.5 46 L50 27.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.32, ease, delay: delay + 0.3 }}
      />
    </motion.svg>
  )
}

/** Small circle checkbox for task rows. */
export function CheckCircle({ checked, size = 22 }: { checked: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden>
      <motion.circle
        cx="11"
        cy="11"
        r="9.75"
        strokeWidth="1.5"
        className={checked ? 'fill-sage stroke-sage' : 'fill-transparent stroke-line-strong'}
        animate={{ scale: checked ? [1, 1.12, 1] : 1 }}
        transition={{ duration: 0.3, ease }}
        style={{ transformOrigin: '50% 50%' }}
      />
      <motion.path
        d="M6.8 11.4 L9.6 14 L15.2 8.4"
        stroke="var(--bg)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
        transition={{ duration: 0.25, ease, delay: checked ? 0.08 : 0 }}
      />
    </svg>
  )
}
