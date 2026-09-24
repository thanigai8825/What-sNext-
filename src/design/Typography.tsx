import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { tSlow } from '../lib/motion'
import { cn } from '../lib/cn'

interface MicroProps {
  children: ReactNode
  className?: string
  /** Text color class; tertiary by default. */
  color?: string
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'span'
}

export function MicroLabel({ children, className, color = 'text-ink-3', as: Tag = 'p' }: MicroProps) {
  return <Tag className={cn('text-micro font-medium uppercase', color, className)}>{children}</Tag>
}

/** Apple-style large navigation title: left aligned, generous space below. */
export function LargeTitle({ children, accessory, className }: { children: ReactNode; accessory?: ReactNode; className?: string }) {
  return (
    <header className={cn('mb-10 flex min-h-11 items-center justify-between gap-4', className)}>
      <h1 className="text-title font-semibold text-ink">{children}</h1>
      {accessory}
    </header>
  )
}

/** Screen container: centered 640px column that rises gently into place. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tSlow}
      className={cn('mx-auto w-full max-w-[640px] px-6 pt-12 pb-40 md:px-12 md:pt-16 md:pb-24', className)}
    >
      {children}
    </motion.main>
  )
}
