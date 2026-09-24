import { useId, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { spring, tFast } from '../lib/motion'

/** iOS-style switch. On is ink, never an accent. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[31px] w-[51px] shrink-0 rounded-pill transition-colors duration-300 ease-apple',
        checked ? 'bg-ink' : 'bg-line-strong',
      )}
    >
      <motion.span
        className="absolute top-[2px] left-[2px] block size-[27px] rounded-pill bg-white shadow-[0_2px_6px_rgb(0_0_0/0.15)]"
        animate={{ x: checked ? 20 : 0 }}
        transition={spring}
      />
    </button>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  label: string
  className?: string
}

/** Segmented control with a sliding thumb. */
export function Segmented<T extends string>({ value, options, onChange, label, className }: SegmentedProps<T>) {
  const id = useId()
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex rounded-control bg-surface p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative h-9 flex-1 rounded-[9px] px-3 text-caption font-medium transition-colors duration-200',
              active ? 'text-ink' : 'text-ink-2 hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[9px] bg-canvas shadow-[0_1px_2px_rgb(0_0_0/0.06),0_1px_1px_rgb(0_0_0/0.04)] dark:bg-surface-hover"
                transition={spring}
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** iOS grouped list. */
export function ListGroup({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      {title && <h2 className="mb-2 px-4 text-micro font-medium uppercase text-ink-3">{title}</h2>}
      <div className="overflow-hidden rounded-card bg-surface [&>*+*]:border-t [&>*+*]:border-line">{children}</div>
      {footer && <p className="mt-2 px-4 text-caption text-ink-3">{footer}</p>}
    </section>
  )
}

interface RowProps {
  icon?: LucideIcon
  label: ReactNode
  detail?: ReactNode
  onClick?: () => void
  accessory?: ReactNode
  chevron?: boolean
  tone?: 'default' | 'blush'
}

export function ListRow({ icon: Icon, label, detail, onClick, accessory, chevron, tone = 'default' }: RowProps) {
  const inner = (
    <>
      {Icon && <Icon size={20} strokeWidth={1.5} className={tone === 'blush' ? 'text-blush' : 'text-ink-2'} aria-hidden />}
      <span className={cn('flex-1 truncate text-left text-body', tone === 'blush' ? 'text-blush' : 'text-ink')}>{label}</span>
      {detail && <span className="truncate text-body text-ink-2">{detail}</span>}
      {accessory}
      {chevron && <ChevronRight size={18} strokeWidth={1.5} className="text-faint" aria-hidden />}
    </>
  )
  const cls = 'flex min-h-[52px] w-full items-center gap-3 px-4 py-2'
  return onClick ? (
    <motion.button type="button" onClick={onClick} whileTap={{ backgroundColor: 'var(--surface-hover)' }} transition={tFast} className={cn(cls, 'transition-colors hover:bg-surface-hover')}>
      {inner}
    </motion.button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
