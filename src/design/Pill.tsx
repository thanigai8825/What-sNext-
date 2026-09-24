import type { ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'

export type Tone = 'sage' | 'sky' | 'sand' | 'blush' | 'lavender' | 'neutral'

const tones: Record<Tone, string> = {
  sage: 'bg-sage-bg text-sage',
  sky: 'bg-sky-bg text-sky',
  sand: 'bg-sand-bg text-sand',
  blush: 'bg-blush-bg text-blush',
  lavender: 'bg-lavender-bg text-lavender',
  neutral: 'bg-surface text-ink-2',
}

interface Props extends Omit<HTMLMotionProps<'span'>, 'children'> {
  tone?: Tone
  icon?: LucideIcon
  children: ReactNode
}

export function Pill({ tone = 'neutral', icon: Icon, className, children, ...rest }: Props) {
  return (
    <motion.span
      className={cn('inline-flex max-w-full items-center gap-1.5 rounded-pill px-2.5 py-1.5 text-caption font-medium', tones[tone], className)}
      {...rest}
    >
      {Icon && <Icon size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />}
      <span className="truncate">{children}</span>
    </motion.span>
  )
}

export function toneClass(tone: Tone) {
  return tones[tone]
}
