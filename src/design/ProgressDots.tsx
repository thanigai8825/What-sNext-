import { motion } from 'motion/react'
import { spring } from '../lib/motion'
import { cn } from '../lib/cn'

export function ProgressDots({ count, index }: { count: number; index: number }) {
  return (
    <div className="flex items-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={count} aria-valuenow={index + 1} aria-label={`Step ${index + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => (
        <motion.span
          key={i}
          className={cn('block h-1.5 rounded-pill', i <= index ? 'bg-ink' : 'bg-line-strong')}
          animate={{ width: i === index ? 20 : 6, opacity: i < index ? 0.35 : 1 }}
          transition={spring}
        />
      ))}
    </div>
  )
}
