import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { CompletionMoment, RatingSheet } from '../components/Completion'
import { Button, MicroLabel } from '../design'
import { explain, goalName } from '../engine/explain'
import type { Reward } from '../engine/rewards'
import { clock } from '../engine/time'
import type { RatingValue, Task } from '../engine/types'
import { isTyping, useNow } from '../lib/hooks'
import { tBase, tSlow } from '../lib/motion'
import { useApp, type Snapshot } from '../store/app'
import { useRanked } from '../store/selectors'
import { useUI } from '../store/ui'

type Phase = { kind: 'work' } | { kind: 'done'; task: Task; reward: Reward | null; snap: Snapshot; elapsed: number }

export function FocusScreen() {
  const navigate = useNavigate()
  const focus = useApp((s) => s.focus)
  const task = useApp((s) => s.tasks.find((t) => t.id === s.focus?.taskId))
  const { ranked, input } = useRanked()
  const [phase, setPhase] = useState<Phase>({ kind: 'work' })
  const [ratingOpen, setRatingOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const running = !!focus?.runningSince
  const now = useNow(running ? 1000 : 60_000)

  const elapsed = task && focus ? task.focusMs + focus.banked + (focus.runningSince ? Math.max(0, now - focus.runningSince) : 0) : 0

  const outcome = useMemo(() => {
    const r = ranked.find((x) => x.task.id === task?.id)
    if (!r) return null
    const ex = explain(r, input)
    return ex.progress ? `This moves “${goalName(ex.progress.goal)}” to ${ex.progress.after}%.` : ex.ifNow
  }, [ranked, input, task?.id])

  // The tab shows the timer, so a glance is enough.
  useEffect(() => {
    if (!task || phase.kind !== 'work') return
    const prev = document.title
    document.title = `${clock(elapsed)} · ${task.title}`
    return () => {
      document.title = prev
    }
  }, [elapsed, task, phase.kind])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const done = useCallback(() => {
    if (!task || phase.kind !== 'work') return
    const app = useApp.getState()
    const snap = app.snapshot()
    const reward = app.completeTask(task.id)
    setPhase({ kind: 'done', task, reward, snap, elapsed })
    timer.current = window.setTimeout(() => setRatingOpen(true), 1900)
  }, [task, phase.kind, elapsed])

  const togglePause = useCallback(() => {
    const s = useApp.getState()
    if (s.focus?.runningSince) s.pauseFocus()
    else s.resumeFocus()
  }, [])

  const exit = useCallback(() => {
    useApp.getState().stopFocus()
    navigate('/')
  }, [navigate])

  const finish = (value?: RatingValue) => {
    if (phase.kind !== 'done') return
    if (value !== undefined) useApp.getState().rate(phase.task.id, value)
    setRatingOpen(false)
    const snap = phase.snap
    useUI.getState().showToast('Task completed', { label: 'Undo', run: () => useApp.getState().restore(snap) })
    navigate('/')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || useUI.getState().sheets > 0 || phase.kind !== 'work') return
      const onControl = (e.target as HTMLElement)?.closest?.('button')
      if (e.key === 'Enter' && !onControl) {
        e.preventDefault()
        done()
      } else if (e.key === ' ' && !onControl) {
        e.preventDefault()
        togglePause()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        exit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [done, togglePause, exit, phase.kind])

  if (phase.kind === 'work' && (!focus || !task)) return <Navigate to="/" replace />
  const shownTask = phase.kind === 'done' ? phase.task : task!
  const shownElapsed = phase.kind === 'done' ? phase.elapsed : elapsed
  const isDone = phase.kind === 'done'

  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col bg-surface"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={tSlow}
    >
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        <motion.div
          className="flex flex-col items-center"
          animate={isDone ? { scale: 0.94, opacity: 0, y: -12 } : { scale: 1, opacity: 1, y: 0 }}
          transition={tBase}
          aria-hidden={isDone}
        >
          <MicroLabel>{running || isDone ? 'Focus' : 'Paused'}</MicroLabel>
          <motion.h1 layoutId={`title-${shownTask.id}`} className="mt-4 max-w-[560px] text-display font-semibold text-ink text-balance">
            {shownTask.title}
          </motion.h1>
          <motion.p
            className="mt-10 text-timer font-light text-ink tabular md:text-[88px]"
            animate={{ opacity: running || isDone ? 1 : [1, 0.35, 1] }}
            transition={running || isDone ? tBase : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            aria-live="off"
            role="timer"
            aria-label={`Elapsed ${clock(shownElapsed)}`}
          >
            {clock(shownElapsed)}
          </motion.p>
          {outcome && <p className="mt-4 max-w-[360px] text-caption text-ink-2 text-pretty">{outcome}</p>}
        </motion.div>

        <AnimatePresence>
          {isDone && (
            <motion.div className="absolute inset-0 flex items-center justify-center px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={tBase}>
              <CompletionMoment reward={phase.reward} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        className="mx-auto flex w-full max-w-[400px] flex-col items-center gap-1 px-6 pb-[calc(32px+env(safe-area-inset-bottom))]"
        animate={{ opacity: isDone ? 0 : 1, y: isDone ? 12 : 0 }}
        transition={tBase}
      >
        <Button full onClick={done} kbd="↵" disabled={isDone}>
          Done
        </Button>
        <div className="flex items-center">
          <Button variant="text" onClick={togglePause} disabled={isDone}>
            {running ? 'Pause' : 'Resume'}
          </Button>
          <span aria-hidden className="text-faint">
            ·
          </span>
          <Button variant="text" onClick={exit} disabled={isDone}>
            Exit
          </Button>
        </div>
      </motion.div>

      <RatingSheet open={ratingOpen} onRate={finish} onSkip={() => finish()} />
    </motion.div>
  )
}
