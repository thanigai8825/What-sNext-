import { forwardRef, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { tFast } from '../lib/motion'

export type ButtonVariant = 'primary' | 'secondary' | 'text'

interface Props extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant
  full?: boolean
  icon?: LucideIcon
  iconRight?: LucideIcon
  /** Keyboard hint shown on desktop, e.g. "Space" */
  kbd?: string
  children?: ReactNode
}

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control text-body font-medium transition-[background-color,color,border-color,opacity] duration-200 ease-apple disabled:pointer-events-none disabled:opacity-40'

const variants: Record<ButtonVariant, string> = {
  primary: 'h-12 px-5 md:h-11 bg-primary text-on-primary hover:bg-primary/88',
  secondary: 'h-12 px-5 md:h-11 bg-secondary text-on-secondary border border-line-strong hover:bg-surface',
  text: 'h-11 min-w-11 px-3 text-ink-2 hover:text-ink',
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', full, icon: Icon, iconRight: IconRight, kbd, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={variant === 'text' ? { opacity: 0.55 } : { scale: 0.98 }}
      transition={tFast}
      className={cn(base, variants[variant], full && 'w-full', className)}
      {...rest}
    >
      {Icon && <Icon size={variant === 'text' ? 18 : 20} strokeWidth={1.5} aria-hidden />}
      {children}
      {IconRight && <IconRight size={18} strokeWidth={1.5} aria-hidden />}
      {kbd && (
        <kbd
          className={cn(
            'ml-1 hidden rounded-[6px] px-1.5 py-0.5 font-sans text-micro font-medium tracking-normal md:inline-block',
            variant === 'primary' ? 'bg-on-primary/15 text-on-primary/70' : 'bg-surface text-ink-3',
          )}
        >
          {kbd}
        </kbd>
      )}
    </motion.button>
  )
})

export const IconButton = forwardRef<HTMLButtonElement, Omit<HTMLMotionProps<'button'>, 'children'> & { icon: LucideIcon; label: string; size?: number }>(
  function IconButton({ icon: Icon, label, size = 20, className, type = 'button', ...rest }, ref) {
    return (
      <motion.button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        whileTap={{ scale: 0.92 }}
        transition={tFast}
        className={cn(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-control text-ink-2 transition-colors duration-200 ease-apple hover:bg-surface hover:text-ink',
          className,
        )}
        {...rest}
      >
        <Icon size={size} strokeWidth={1.5} aria-hidden />
      </motion.button>
    )
  },
)
