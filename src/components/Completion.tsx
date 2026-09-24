import { useEffect } from 'react'
import { motion } from 'motion/react'
import { BatteryLow, CircleMinus, Clock3, Hourglass } from 'lucide-react'
import type { Reward } from '../engine/rewards'
import type { RatingValue, SkipReason } from '../engine/types'
import { Checkmark, MicroLabel, ProgressBar, Sheet, SheetHeader } from '../design'
import { cn } from '../lib/cn'
import { springPop, tBase } from '../lib/motion'

/** The quiet celebration: a checkmark draws itself, then one varied reward. */
export function CompletionMoment({ reward, compact = false }: { reward: Reward | null; compact?: boolean }) {
  return (
    <div className="flex flex-col items-center text-center">
      <Checkmark size={compact ? 56 : 72} />
      {reward && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...tBase, delay: 0.55 }} className="mt-5 w-full max-w-[340px]">
          <p className={cn('font-semibold text-ink text-balance', compact ? 'text-headline' : 'text-headline md:text-title')}>{reward.title}</p>
          {reward.detail && <p className="mt-1.5 text-caption text-ink-2 text-pretty">{reward.detail}</p>}
          {reward.progress && (
            <div className="mt-4">
              <ProgressBar value={reward.progress.after} from={reward.progress.before} delay={0.75} label={`${reward.progress.goal.title} progress`} />
              <p className="mt-2 text-caption text-ink-2 tabular">
                {reward.progress.before}% → {reward.progress.after}%
              </p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}

const RATINGS: Array<{ value: RatingValue; label: string }> = [
  { value: 0, label: 'Little' },
  { value: 1, label: 'Some' },
  { value: 2, label: 'A lot' },
]

/** Investment: one question after every finished task. */
export function RatingSheet({ open, onRate, onSkip }: { open: boolean; onRate: (v: RatingValue) => void; onSkip: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const i = ['1', '2', '3'].indexOf(e.key)
      if (i >= 0) {
        e.preventDefault()
        onRate(RATINGS[i].value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onRate])
  return (
    <Sheet open={open} onClose={onSkip} label="How much did this move things forward?" backdrop="clear" placement="bottom">
      <SheetHeader title="How much did this move things forward?" detail="Your answer shapes what comes next." />
      <div className="grid grid-cols-3 gap-3">
        {RATINGS.map((r, i) => (
          <motion.button
            key={r.value}
            type="button"
            onClick={() => onRate(r.value)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springPop, delay: 0.1 + i * 0.05 }}
            whileTap={{ scale: 0.96 }}
            className="h-14 rounded-pill border border-line-strong bg-canvas text-body font-medium text-ink transition-colors duration-200 hover:bg-surface"
          >
            {r.label}
          </motion.button>
        ))}
      </div>
      <p className="mt-4 text-center text-caption text-ink-3 md:block">
        <span className="hidden md:inline">Press 1, 2 or 3 · </span>Esc to skip
      </p>
    </Sheet>
  )
}

export const SKIP_OPTIONS: Array<{ reason: SkipReason; label: string; icon: typeof Clock3; toast: string }> = [
  { reason: 'no_time', label: 'No time', icon: Clock3, toast: 'Got it. Here’s something shorter.' },
  { reason: 'low_energy', label: 'Low energy', icon: BatteryLow, toast: 'Got it. Here’s something lighter.' },
  { reason: 'blocked', label: 'Blocked', icon: Hourglass, toast: 'Marked as waiting until tomorrow.' },
  { reason: 'not_important', label: 'Not important', icon: CircleMinus, toast: 'Got it. It won’t lead your list.' },
]

/** Gentle friction: one tap to say why, with the honest cost of waiting in view. */
export function NotNowSheet({
  open,
  onClose,
  onPick,
  costOfWaiting,
}: {
  open: boolean
  onClose: () => void
  onPick: (r: SkipReason) => void
  costOfWaiting?: string
}) {
  return (
    <Sheet open={open} onClose={onClose} label="What’s in the way?">
      <SheetHeader title="What’s in the way?" detail="One tap. The next pick adjusts right away." />
      <div className="grid grid-cols-2 gap-3">
        {SKIP_OPTIONS.map((o, i) => {
          const Icon = o.icon
          return (
            <motion.button
              key={o.reason}
              type="button"
              data-autofocus={i === 0 ? true : undefined}
              onClick={() => onPick(o.reason)}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springPop, delay: 0.06 + i * 0.04 }}
              className="flex h-[72px] flex-col items-start justify-between rounded-card bg-surface p-3.5 text-left transition-colors duration-200 hover:bg-surface-hover"
            >
              <Icon size={20} strokeWidth={1.5} className="text-ink-2" aria-hidden />
              <span className="text-body font-medium text-ink">{o.label}</span>
            </motion.button>
          )
        })}
      </div>
      {costOfWaiting && (
        <div className="mt-5 rounded-inner bg-blush-bg px-4 py-3">
          <MicroLabel color="text-blush">If you wait</MicroLabel>
          <p className="mt-1 text-caption text-blush">{costOfWaiting}</p>
        </div>
      )}
    </Sheet>
  )
}
