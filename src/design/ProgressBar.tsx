import { motion, useReducedMotion } from 'motion/react'
import { cn } from '../lib/cn'
import { springFill } from '../lib/motion'

interface Props {
  value: number
  /** Animate from this value on mount — for "30% → 45%" moments. */
  from?: number
  delay?: number
  label?: string
  className?: string
  tone?: 'sage' | 'ink'
}

export function ProgressBar({ value, from, delay = 0, label, className, tone = 'sage' }: Props) {
  const reduce = useReducedMotion()
  const clamp = (x: number) => Math.max(0, Math.min(100, x))
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamp(value))}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-pill bg-line', className)}
    >
      <motion.div
        className={cn('h-full rounded-pill', tone === 'sage' ? 'bg-sage-fill' : 'bg-ink')}
        initial={{ width: `${clamp(from ?? value)}%` }}
        animate={{ width: `${clamp(value)}%` }}
        transition={reduce ? { duration: 0 } : { ...springFill, delay }}
      />
    </div>
  )
}
