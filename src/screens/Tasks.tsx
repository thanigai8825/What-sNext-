import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react'
import { ChevronDown, GripVertical } from 'lucide-react'
import { SettingsButton } from '../components/SettingsButton'
import { TaskDetailSheet } from '../components/TaskDetail'
import { Button, CheckCircle, LargeTitle, MicroLabel, Page } from '../design'
import { goalName } from '../engine/explain'
import { dueLabel, dueWords, effortLabel } from '../engine/time'
import { numberWord, shortTitle } from '../engine/text'
import type { Bucket, Goal, Ranked } from '../engine/types'
import { cn } from '../lib/cn'
import { spring, tBase, tFast } from '../lib/motion'
import { useApp } from '../store/app'
import { useRanked } from '../store/selectors'
import { useUI, withUndo } from '../store/ui'

const SECTIONS: Array<{ bucket: Bucket; label: string }> = [
  { bucket: 'now', label: 'Do now' },
  { bucket: 'next', label: 'Next' },
  { bucket: 'later', label: 'Later' },
  { bucket: 'skip', label: 'Probably skip' },
]

export function TasksScreen() {
  const { ranked } = useRanked()
  const goals = useApp((s) => s.goals)
  const [detail, setDetail] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const noteTimer = useRef<number | undefined>(undefined)

  const say = (text: string) => {
    setNote(text)
    window.clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => setNote(null), 7000)
  }
  useEffect(() => () => window.clearTimeout(noteTimer.current), [])

  return (
    <Page>
      <LargeTitle accessory={<SettingsButton />}>Tasks</LargeTitle>

      <AnimatePresence>
        {note && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={tBase}
            className="overflow-hidden"
            role="status"
          >
            <p className="mb-8 rounded-inner bg-sky-bg px-4 py-3 text-caption text-sky">{note}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {ranked.length === 0 ? (
        <div className="flex flex-col items-start gap-5">
          <p className="text-body text-ink-2">Nothing here yet. Add what’s on your plate.</p>
          <Button variant="secondary" onClick={() => useUI.getState().setQuickAdd(true)}>
            Add a task
          </Button>
        </div>
      ) : (
        <div className="space-y-12">
          {SECTIONS.map((s) => {
            const items = ranked.filter((r) => r.bucket === s.bucket)
            if (!items.length) return null
            return <Section key={s.bucket} bucket={s.bucket} label={s.label} items={items} goals={goals} onOpen={setDetail} onNote={say} />
          })}
        </div>
      )}
      <TaskDetailSheet taskId={detail} onClose={() => setDetail(null)} />
    </Page>
  )
}

function Section({
  bucket,
  label,
  items,
  goals,
  onOpen,
  onNote,
}: {
  bucket: Bucket
  label: string
  items: Ranked[]
  goals: Goal[]
  onOpen: (id: string) => void
  onNote: (text: string) => void
}) {
  const collapsible = bucket === 'skip'
  const [open, setOpen] = useState(!collapsible)
  const [order, setOrder] = useState(() => items.map((r) => r.task.id))
  const dragging = useRef(false)
  const before = useRef<string[]>([])
  const byId = useMemo(() => new Map(items.map((r) => [r.task.id, r])), [items])

  // Follow the engine, except mid-drag.
  const key = items.map((r) => r.task.id).join()
  useEffect(() => {
    if (!dragging.current) setOrder(items.map((r) => r.task.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const commit = (id: string, next = order) => {
    dragging.current = false
    const idx = next.indexOf(id)
    const prevIdx = before.current.indexOf(id)
    if (idx === prevIdx) return
    const r = byId.get(id)
    if (!r) return
    const above = next[idx - 1] ? byId.get(next[idx - 1])!.score : null
    const below = next[idx + 1] ? byId.get(next[idx + 1])!.score : null
    useApp.getState().reorder(id, above, below, r.score)

    // The engine adapts, and speaks up once if it disagrees.
    const passed = idx < prevIdx ? before.current.slice(idx, prevIdx).map((x) => byId.get(x)!) : [r]
    const strong = passed.find((p) => p.factors.urgency >= 0.6 || p.dependents.length > 0 || p.factors.impact >= r.factors.impact + 0.2)
    if (strong && (idx > prevIdx || strong !== r)) onNote(disagreement(strong, goals))
    else onNote('Got it. Your order sticks, and similar picks will lean this way.')
  }

  /** Keyboard reordering: arrow keys on the handle move one step. */
  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    before.current = order
    setOrder(next)
    commit(id, next)
  }

  const shown = order.map((id) => byId.get(id)).filter((r): r is Ranked => !!r)

  return (
    <section aria-label={label}>
      <div className="mb-2 flex h-8 items-center justify-between">
        <MicroLabel as="h2">{label}</MicroLabel>
        {collapsible && (
          <Button variant="text" className="-mr-3 h-8 text-caption" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Hide' : `Show ${items.length}`}
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={tBase} className="inline-flex">
              <ChevronDown size={16} strokeWidth={1.5} aria-hidden />
            </motion.span>
          </Button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={tBase} className="overflow-hidden">
            <Reorder.Group axis="y" values={order} onReorder={setOrder} className="-mx-3" as="ul">
              <AnimatePresence initial={false}>
                {shown.map((r) => (
                  <Row
                    key={r.task.id}
                    r={r}
                    muted={bucket === 'skip'}
                    goals={goals}
                    onOpen={() => onOpen(r.task.id)}
                    onDragStart={() => {
                      dragging.current = true
                      before.current = order
                    }}
                    onDragEnd={() => commit(r.task.id)}
                    onMove={(d) => move(r.task.id, d)}
                  />
                ))}
              </AnimatePresence>
            </Reorder.Group>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function disagreement(r: Ranked, goals: Goal[]): string {
  const title = `“${shortTitle(r.task.title, 34)}”`
  if (r.task.due && r.factors.urgency >= 0.6) return `Okay. I’d still keep ${title} close, since it’s due ${dueWords(r.task.due, new Date())}.`
  if (r.dependents.length) return `Okay. I’d still keep ${title} close: ${numberWord(r.dependents.length)} ${r.dependents.length === 1 ? 'task is' : 'tasks are'} waiting on it.`
  const g = goals.find((x) => x.id === r.task.goalId)
  return g ? `Okay. I’d still keep ${title} close, since it moves “${goalName(g)}” most.` : `Okay. I’d still keep ${title} close.`
}

function caption(r: Ranked, goals: Goal[]): string {
  if (r.waitingOn.length) return `Waiting on “${shortTitle(r.waitingOn[0].title, 30)}”`
  const now = Date.now()
  if (r.task.blockedUntil && new Date(r.task.blockedUntil).getTime() > now) return 'Blocked · back tomorrow'
  const snoozed = r.task.snoozedUntil && new Date(r.task.snoozedUntil).getTime() > now
  const g = goals.find((x) => x.id === r.task.goalId)
  const parts = [snoozed ? 'Back soon' : null, g?.title, r.task.due ? dueLabel(r.task.due, r.task.dueHasTime, new Date()) : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : effortLabel(r.task.effort)
}

function Row({
  r,
  muted,
  goals,
  onOpen,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  r: Ranked
  muted: boolean
  goals: Goal[]
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const controls = useDragControls()
  const [checked, setChecked] = useState(false)
  const complete = () => {
    if (checked) return
    setChecked(true)
    window.setTimeout(() => withUndo('Task completed', () => useApp.getState().completeTask(r.task.id)), 420)
  }
  return (
    <Reorder.Item
      value={r.task.id}
      dragListener={false}
      dragControls={controls}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0, transition: tBase }}
      whileDrag={{ scale: 1.02, boxShadow: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px rgb(0 0 0 / 0.08)', zIndex: 10 }}
      transition={spring}
      className="relative rounded-inner bg-canvas"
      as="li"
    >
      <div className="group flex min-h-[60px] items-center gap-1 px-1">
        <button type="button" onClick={complete} aria-label={`Complete ${r.task.title}`} className="flex size-11 shrink-0 items-center justify-center rounded-pill">
          <motion.span whileTap={{ scale: 0.85 }} transition={tFast} className="inline-flex">
            <CheckCircle checked={checked} />
          </motion.span>
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-inner py-2 pr-2 text-left">
          <p className={cn('truncate text-body transition-colors duration-300', checked ? 'text-ink-3 line-through decoration-line-strong' : muted ? 'text-ink-3' : 'text-ink')}>
            {r.task.title}
          </p>
          <p className={cn('truncate text-caption', muted ? 'text-ink-3' : 'text-ink-2')}>{caption(r, goals)}</p>
        </button>
        <button
          type="button"
          aria-label={`Reorder ${r.task.title}. Use arrow keys to move`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              onMove(e.key === 'ArrowUp' ? -1 : 1)
            }
          }}
          onPointerDown={(e) => {
            e.preventDefault()
            controls.start(e)
          }}
          className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-inner text-faint opacity-100 transition-opacity active:cursor-grabbing md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          <GripVertical size={18} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </Reorder.Item>
  )
}
