import { useEffect, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { Target } from 'lucide-react'
import { MicroLabel, Pill } from '../design'
import { cn } from '../lib/cn'
import { spring, springPop, tBase } from '../lib/motion'

const DAY = [
  { id: 'messages', title: 'Reply to messages', busy: true },
  { id: 'files', title: 'Sort out old files', busy: true },
  { id: 'job', title: 'Apply for the job', busy: false },
  { id: 'videos', title: 'Watch a few videos', busy: true },
]

const DESCRIPTION =
  'Example: a day with four things to do. Three are easy busy work. What’s Next picks “Apply for the job”, because it’s due Friday and moves your biggest goal.'

/**
 * The whole idea in four seconds: an ordinary day's list, the easy stuff
 * that fills it, and the one task that actually moves you forward.
 */
export function WelcomeDemo({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (reduce) {
      setPhase(3)
      return
    }
    const timers = [
      window.setTimeout(() => setPhase(1), 1500),
      window.setTimeout(() => setPhase(2), 3000),
      window.setTimeout(() => setPhase(3), 3700),
    ]
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [reduce])

  const rows = phase >= 2 ? DAY.filter((t) => !t.busy) : DAY

  return (
    <div role="img" aria-label={DESCRIPTION} className={cn('relative h-[252px] overflow-hidden rounded-focus bg-surface p-5 shadow-focus', className)}>
      <div className="mb-2 h-4" aria-hidden>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={phase >= 2 ? 'now' : 'day'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={tBase}
          >
            <MicroLabel>{phase >= 2 ? 'Right now' : 'Your day'}</MicroLabel>
          </motion.div>
        </AnimatePresence>
      </div>

      <LayoutGroup>
        <ul aria-hidden>
          <AnimatePresence initial={false}>
            {rows.map((t, i) => (
              <motion.li
                key={t.id}
                layout="position"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: phase === 1 && t.busy ? 0.4 : 1, y: 0 }}
                exit={{ opacity: 0, y: 14, transition: { duration: 0.22 } }}
                transition={{ ...spring, delay: phase === 0 ? 0.3 + i * 0.09 : 0 }}
              >
                {phase >= 2 ? <Picked expanded={phase >= 3} title={t.title} /> : <Row title={t.title} busy={t.busy} tagged={phase === 1} />}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </LayoutGroup>
    </div>
  )
}

function Row({ title, busy, tagged }: { title: string; busy: boolean; tagged: boolean }) {
  return (
    <div className="flex h-11 items-center gap-3">
      <span className="size-[18px] shrink-0 rounded-pill border-[1.5px] border-line-strong" />
      <span className="flex-1 truncate text-body text-ink">{title}</span>
      <AnimatePresence>
        {tagged && (
          <motion.span
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ ...springPop, delay: busy ? 0 : 0.25 }}
            className={cn('shrink-0 text-caption font-medium', busy ? 'text-ink-3' : 'text-sage')}
          >
            {busy ? 'Easy' : 'Important'}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

function Picked({ title, expanded }: { title: string; expanded: boolean }) {
  return (
    <div className="pt-1">
      <motion.p layout="position" className="text-headline font-semibold text-ink">
        {title}
      </motion.p>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={tBase}>
            <div className="mt-3 flex items-center gap-3">
              <Pill tone="sage" icon={Target}>
                Get a better job
              </Pill>
              <span className="text-caption text-ink-2">1 hr · Fri</span>
            </div>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...tBase, delay: 0.2 }} className="mt-3 text-body text-ink-2">
              It’s due Friday, and it moves your biggest goal.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...tBase, delay: 0.45 }}
              className="mt-4 flex h-10 items-center justify-center rounded-control bg-primary text-caption font-medium text-on-primary"
            >
              Start
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
