import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { ChevronDown, Target } from 'lucide-react'
import { NotNowSheet, RatingSheet, CompletionMoment, SKIP_OPTIONS } from '../components/Completion'
import { SettingsButton } from '../components/SettingsButton'
import { TaskDetailSheet } from '../components/TaskDetail'
import { StreamingText } from '../components/StreamingText'
import { Button, Collapse, MicroLabel, Page, Pill, ProgressBar, SkeletonLines } from '../design'
import type { Explanation } from '../engine/explain'
import type { Reward } from '../engine/rewards'
import { dueLabel, effortLabel } from '../engine/time'
import type { Ranked, RatingValue, SkipReason } from '../engine/types'
import { isTyping } from '../lib/hooks'
import { cn } from '../lib/cn'
import { tBase, tFast, tSlow } from '../lib/motion'
import { useApp, type Snapshot } from '../store/app'
import { useFocusPick } from '../store/selectors'
import { useUI, withUndo } from '../store/ui'

type Phase = { kind: 'idle' } | { kind: 'done'; r: Ranked; ex: Explanation; reward: Reward | null; snap: Snapshot }

const card: Variants = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  enter: { opacity: 1, y: 0, scale: 1, transition: { ...tSlow, delay: 0.04 } },
  exit: (kind: 'done' | 'skip' | 'none') =>
    kind === 'skip'
      ? { opacity: 0, x: -28, transition: tBase }
      : kind === 'done'
        ? { opacity: 0, y: -16, scale: 0.97, transition: tBase }
        : { opacity: 0, transition: tFast },
}

export function NowScreen() {
  const navigate = useNavigate()
  const { top, upNext, explanation, ranked } = useFocusPick()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [ratingOpen, setRatingOpen] = useState(false)
  const [notNowOpen, setNotNowOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [exitKind, setExitKind] = useState<'done' | 'skip' | 'none'>('none')
  const welcomeBack = useUI((s) => s.welcomeBack)
  const [greeting, setGreeting] = useState(false)
  const ratingTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!welcomeBack || Date.now() - welcomeBack.at > 5000) return
    setGreeting(true)
    const t = window.setTimeout(() => setGreeting(false), 5000)
    return () => window.clearTimeout(t)
  }, [welcomeBack])
  const greetingText = top && welcomeBack?.prevId === top.task.id ? 'Welcome back · Still the one' : 'Welcome back · Here’s what’s next'

  useEffect(() => () => window.clearTimeout(ratingTimer.current), [])

  const start = useCallback(() => {
    if (!top || phase.kind !== 'idle') return
    useApp.getState().startFocus(top.task.id)
    navigate('/focus')
  }, [top, phase.kind, navigate])

  const complete = useCallback(() => {
    if (!top || !explanation || phase.kind !== 'idle') return
    const app = useApp.getState()
    const snap = app.snapshot()
    const reward = app.completeTask(top.task.id)
    setPhase({ kind: 'done', r: top, ex: explanation, reward, snap })
    ratingTimer.current = window.setTimeout(() => setRatingOpen(true), 1700)
  }, [top, explanation, phase.kind])

  const finish = (value?: RatingValue) => {
    if (phase.kind !== 'done') return
    if (value !== undefined) useApp.getState().rate(phase.r.task.id, value)
    setRatingOpen(false)
    setExitKind('done')
    const snap = phase.snap
    setPhase({ kind: 'idle' })
    useUI.getState().showToast('Task completed', { label: 'Undo', run: () => useApp.getState().restore(snap) })
  }

  const notNow = (reason: SkipReason) => {
    if (!top) return
    setNotNowOpen(false)
    setExitKind('skip')
    const msg = SKIP_OPTIONS.find((o) => o.reason === reason)!.toast
    withUndo(msg, () => useApp.getState().notNow(top.task.id, reason))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || useUI.getState().sheets > 0) return
      const onControl = (e.target as HTMLElement)?.closest?.('button, a, [role="button"]')
      if (e.key === ' ' && !onControl) {
        e.preventDefault()
        start()
      } else if (e.key === 'Enter' && !onControl) {
        e.preventDefault()
        complete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [start, complete])

  const shown = phase.kind === 'done' ? { r: phase.r, ex: phase.ex } : top && explanation ? { r: top, ex: explanation } : null
  const hasTasks = ranked.length > 0

  return (
    <Page>
      <div className="mb-4 flex h-11 items-center justify-between">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={greeting ? 'back' : 'now'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={tBase}>
            <MicroLabel as="h1">{greeting ? greetingText : 'Right now'}</MicroLabel>
          </motion.div>
        </AnimatePresence>
        <SettingsButton />
      </div>

      <AnimatePresence mode="wait" custom={exitKind} onExitComplete={() => setExitKind('none')}>
        {shown ? (
          <FocusCard
            key={shown.r.task.id}
            r={shown.r}
            ex={shown.ex}
            celebrating={phase.kind === 'done' ? phase.reward : undefined}
            onStart={start}
            onNotNow={() => setNotNowOpen(true)}
          />
        ) : (
          <EmptyState key="empty" hasTasks={hasTasks} />
        )}
      </AnimatePresence>

      {upNext.length > 0 && phase.kind === 'idle' && (
        <motion.section
          layout="position"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { ...tSlow, delay: 0.22 } }}
          transition={tSlow}
          className="mt-12"
          aria-labelledby="up-next"
        >
          <MicroLabel as="h2" className="mb-2">
            <span id="up-next">Up next</span>
          </MicroLabel>
          <ul>
            <AnimatePresence initial={false}>
              {upNext.map((r, i) => (
                <motion.li key={r.task.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { ...tBase, delay: 0.12 + i * 0.05 } }} exit={{ opacity: 0, transition: tFast }}>
                  <button
                    type="button"
                    onClick={() => setDetailId(r.task.id)}
                    className="group -mx-3 flex h-12 w-[calc(100%+24px)] items-center gap-4 rounded-inner px-3 text-left transition-colors duration-200 hover:bg-surface"
                  >
                    <span className="flex-1 truncate text-body text-ink-2 transition-colors group-hover:text-ink">{r.task.title}</span>
                    <span className="shrink-0 text-caption text-ink-3">{effortLabel(r.task.effort)}</span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.section>
      )}

      <NotNowSheet open={notNowOpen} onClose={() => setNotNowOpen(false)} onPick={notNow} costOfWaiting={explanation?.ifDelay} />
      <RatingSheet open={ratingOpen} onRate={finish} onSkip={() => finish()} />
      <TaskDetailSheet taskId={detailId} onClose={() => setDetailId(null)} />
    </Page>
  )
}

function FocusCard({
  r,
  ex,
  celebrating,
  onStart,
  onNotNow,
}: {
  r: Ranked
  ex: Explanation
  celebrating?: Reward | null
  onStart: () => void
  onNotNow: () => void
}) {
  const { task } = r
  const [why, setWhy] = useState(false)
  const goal = useApp((s) => (task.goalId ? s.goals.find((g) => g.id === task.goalId) : null))
  const aiEnabled = useUI((s) => s.aiEnabled)
  const inFocus = useApp((s) => s.focus?.taskId === task.id)
  const partial = useUI((s) => s.aiPartial[task.id])
  const done = celebrating !== undefined

  // While the model is thinking about this card for the first time, shimmer briefly; never block.
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 3500)
    return () => window.clearTimeout(t)
  }, [])
  const awaitingAI = !!aiEnabled && ex.aiPending && !waited

  const meta = [effortLabel(task.effort), task.due ? dueLabel(task.due, task.dueHasTime, new Date()) : null].filter(Boolean).join(' · ')

  return (
    <motion.article
      variants={card}
      initial="initial"
      animate="enter"
      exit="exit"
      aria-labelledby={`task-${task.id}`}
      className="relative overflow-hidden rounded-focus bg-surface p-6 shadow-focus md:p-8"
    >
      <motion.div animate={done ? { scale: 0.97, opacity: 0, filter: 'blur(2px)' } : { scale: 1, opacity: 1, filter: 'blur(0px)' }} transition={tBase} aria-hidden={done}>
        <motion.h2 layoutId={`title-${task.id}`} layoutCrossfade={false} id={`task-${task.id}`} className="text-display font-semibold text-ink text-balance">
          {task.title}
        </motion.h2>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {goal && (
            <Pill tone="sage" icon={Target}>
              {goal.title}
            </Pill>
          )}
          <span className="text-caption text-ink-2">{meta}</span>
        </div>

        <div className="mt-5 min-h-[44px]" aria-live="polite">
          {awaitingAI && !partial ? (
            <SkeletonLines lines={2} />
          ) : (
            <StreamingText text={awaitingAI && partial ? partial : ex.reason} streaming={awaitingAI && !!partial} className="text-body text-ink-2 text-pretty" />
          )}
        </div>

        <Button full className="mt-6" onClick={onStart} kbd="Space" disabled={done}>
          {inFocus ? 'Resume' : 'Start'}
        </Button>

        <div className="mt-2 flex items-center justify-center">
          <Button variant="text" onClick={onNotNow} disabled={done}>
            Not now
          </Button>
          <span aria-hidden className="text-faint">
            ·
          </span>
          <Button variant="text" onClick={() => setWhy((w) => !w)} aria-expanded={why} aria-controls={`why-${task.id}`} disabled={done}>
            Why this first
            <motion.span animate={{ rotate: why ? 180 : 0 }} transition={tBase} className="inline-flex">
              <ChevronDown size={18} strokeWidth={1.5} aria-hidden />
            </motion.span>
          </Button>
        </div>

        <Collapse open={why && !done} id={`why-${task.id}`}>
          <WhyPanel ex={ex} />
        </Collapse>
      </motion.div>

      <AnimatePresence>
        {done && (
          <motion.div className="absolute inset-0 flex items-center justify-center p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={tFast}>
            <CompletionMoment reward={celebrating ?? null} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  )
}

function WhyPanel({ ex }: { ex: Explanation }) {
  return (
    <div className="space-y-3 pt-4">
      <div className="rounded-inner bg-sage-bg px-4 py-3.5">
        <MicroLabel color="text-sage">If you do this now</MicroLabel>
        <p className="mt-1 text-body text-sage">{ex.ifNow}</p>
      </div>
      <div className="rounded-inner bg-blush-bg px-4 py-3.5">
        <MicroLabel color="text-blush">If you wait</MicroLabel>
        <p className="mt-1 text-body text-blush">{ex.ifDelay}</p>
      </div>
      {ex.progress && (
        <div className="px-1 pt-2">
          <p className="mb-2.5 text-caption text-ink-2">
            Moves “{ex.progress.goal.title}” from{' '}
            <span className="whitespace-nowrap tabular">
              {ex.progress.before}% → <span className="font-medium text-ink">{ex.progress.after}%</span>
            </span>
          </p>
          <ProgressBar value={ex.progress.after} from={ex.progress.before} delay={0.25} label={`${ex.progress.goal.title} progress`} />
        </div>
      )}
    </div>
  )
}

function EmptyState({ hasTasks }: { hasTasks: boolean }) {
  const navigate = useNavigate()
  const setQuickAdd = useUI((s) => s.setQuickAdd)
  const doneToday = useApp((s) => s.tasks.some((t) => t.status === 'done' && t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString()))
  const open = useApp((s) => s.tasks.some((t) => t.status === 'open'))
  let line = 'Nothing on your plate yet.'
  let action = <Button variant="secondary" onClick={() => setQuickAdd(true)}>Add a task</Button>
  if (open && hasTasks) {
    line = 'Nothing urgent. Pick anything from Next.'
    action = <Button variant="secondary" onClick={() => navigate('/tasks')}>See tasks</Button>
  } else if (doneToday) {
    line = 'That’s everything that matters today.'
    action = <Button variant="secondary" onClick={() => setQuickAdd(true)}>Add what’s next</Button>
  }
  return (
    <motion.div variants={card} initial="initial" animate="enter" exit="exit" className={cn('flex flex-col items-start gap-5 rounded-focus bg-surface p-6 md:p-8')}>
      <p className="text-headline font-semibold text-ink">{line}</p>
      {action}
    </motion.div>
  )
}
