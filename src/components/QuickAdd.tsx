import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CalendarDays, Clock3, Target } from 'lucide-react'
import { refineTasks, suggest } from '../ai/brain'
import { parseTaskLine, type ParsedTask } from '../engine/parse'
import { rank, topPick } from '../engine/score'
import { atHour, dueLabel, effortLabel, fromDayKey } from '../engine/time'
import type { Task } from '../engine/types'
import { Button, Input, MicroLabel, Pill, Sheet } from '../design'
import { springPop } from '../lib/motion'
import { engineInput, useApp } from '../store/app'
import { useUI, withUndo } from '../store/ui'

const EFFORT_STEPS = [10, 15, 30, 45, 60, 90, 120, 180]

type Overrides = Partial<Pick<ParsedTask, 'goalId' | 'due' | 'effort'>>

export function QuickAdd() {
  const open = useUI((s) => s.quickAddOpen)
  const setOpen = useUI((s) => s.setQuickAdd)
  return (
    <Sheet open={open} onClose={() => setOpen(false)} label="New task">
      <QuickAddForm onDone={() => setOpen(false)} />
    </Sheet>
  )
}

function QuickAddForm({ onDone }: { onDone: () => void }) {
  const goals = useApp((s) => s.goals)
  const dayEndHour = useApp((s) => s.settings.dayEndHour)
  const aiEnabled = useUI((s) => s.aiEnabled)
  const [value, setValue] = useState('')
  const [over, setOver] = useState<Overrides>({})
  const [ai, setAI] = useState<{ for: string; data: Partial<ParsedTask> } | null>(null)
  const [thinking, setThinking] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)

  const local = useMemo(() => (value.trim() ? parseTaskLine(value, { now: new Date(), goals, dayEndHour }) : null), [value, goals, dayEndHour])

  // Ask the model once typing settles; the local parse shows instantly meanwhile.
  useEffect(() => {
    if (!aiEnabled || value.trim().length < 4) return
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      setThinking(true)
      const s = await suggest(value, ctrl.signal)
      if (ctrl.signal.aborted) return
      setThinking(false)
      if (!s) return
      const data: Partial<ParsedTask> = {}
      if (s.title) data.title = s.title
      if (s.due !== undefined) {
        data.due = s.due ? new Date(s.due).toISOString() : null
        data.dueHasTime = !!s.dueHasTime
      }
      if (typeof s.effort === 'number' && s.effort > 0) data.effort = Math.round(s.effort)
      if (s.goalId === null || goals.some((g) => g.id === s.goalId)) data.goalId = s.goalId ?? null
      setAI({ for: value, data })
    }, 700)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
      setThinking(false)
    }
  }, [value, aiEnabled, goals])

  const merged: ParsedTask | null = local ? { ...local, ...(ai?.for === value ? ai.data : {}), ...over } : null
  const goal = merged?.goalId ? goals.find((g) => g.id === merged.goalId) : null
  const activeGoals = goals.filter((g) => !g.completedAt).sort((a, b) => a.position - b.position)

  const cycleGoal = () => {
    const ids = [...activeGoals.map((g) => g.id), null]
    const i = ids.indexOf(merged?.goalId ?? null)
    setOver((o) => ({ ...o, goalId: ids[(i + 1) % ids.length] }))
  }
  const cycleEffort = () => {
    const cur = merged?.effort ?? 30
    const next = EFFORT_STEPS.find((e) => e > cur) ?? EFFORT_STEPS[0]
    setOver((o) => ({ ...o, effort: next }))
  }
  const pickDate = () => {
    const el = dateRef.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!merged || !merged.title) return
    const lock = (Object.keys(over) as Array<keyof Overrides>).map((k) => k as Task['locked'][number])
    let ids: string[] = []
    const app = useApp.getState()
    const before = new Set(app.tasks.map((t) => t.id))
    withUndo('Added', () => {
      ids = app.addParsedTasks([merged])
      if (lock.length) app.updateTask(ids[0], {}, lock)
    })
    const s = useApp.getState()
    const top = topPick(rank(engineInput(s)))
    if (top && !before.has(top.task.id) && ids.includes(top.task.id)) {
      useUI.getState().showToast('Added as your top pick', useUI.getState().toast?.action)
    }
    if (aiEnabled && ai?.for !== value) void refineTasks(ids, [value])
    onDone()
  }

  return (
    <form onSubmit={submit}>
      <MicroLabel className="mb-3">New task</MicroLabel>
      <Input
        data-autofocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          if (!e.target.value) setOver({})
        }}
        placeholder="e.g. Send proposal to Arun by Friday, 1 hr"
        aria-label="Task"
        autoComplete="off"
        enterKeyHint="done"
      />
      <div className="mt-3 flex min-h-8 flex-wrap items-center gap-2" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          {merged && (
            <motion.button
              key="goal"
              type="button"
              layout
              onClick={cycleGoal}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={springPop}
              className="rounded-pill"
              aria-label={`Goal: ${goal?.title ?? 'none'}. Tap to change`}
            >
              <Pill tone={goal ? 'sage' : 'neutral'} icon={Target}>
                {goal ? goal.title : 'No goal'}
              </Pill>
            </motion.button>
          )}
          {merged && (
            <motion.span key="due" layout className="relative rounded-pill" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ ...springPop, delay: 0.03 }}>
              <button type="button" onClick={pickDate} className="rounded-pill" aria-label={`Deadline: ${merged.due ? dueLabel(merged.due, merged.dueHasTime, new Date()) : 'none'}. Tap to change`}>
                <Pill tone={merged.due ? 'sand' : 'neutral'} icon={CalendarDays}>
                  {merged.due ? dueLabel(merged.due, merged.dueHasTime, new Date()) : 'No deadline'}
                </Pill>
              </button>
              <input
                ref={dateRef}
                type="date"
                tabIndex={-1}
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0"
                onChange={(e) => {
                  const v = e.target.value
                  setOver((o) => ({ ...o, due: v ? atHour(fromDayKey(v), dayEndHour).toISOString() : null }))
                }}
              />
            </motion.span>
          )}
          {merged && (
            <motion.button
              key="effort"
              type="button"
              layout
              onClick={cycleEffort}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ ...springPop, delay: 0.06 }}
              className="rounded-pill"
              aria-label={`Effort: ${effortLabel(merged.effort)}. Tap to change`}
            >
              <Pill tone="neutral" icon={Clock3}>
                {merged.effortGuessed && over.effort === undefined ? '~' : ''}
                {effortLabel(merged.effort)}
              </Pill>
            </motion.button>
          )}
          {thinking && (
            <motion.span key="thinking" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="skeleton block h-8 w-16 rounded-pill" aria-label="Refining" />
          )}
        </AnimatePresence>
      </div>
      <p className="mt-2 min-h-[18px] text-caption text-ink-3">{merged ? 'Tap a suggestion to change it.' : 'Write it the way you’d say it. Deadline, effort and goal are picked up for you.'}</p>
      <Button type="submit" full className="mt-6" disabled={!merged?.title} kbd="↵">
        Add task
      </Button>
    </form>
  )
}
