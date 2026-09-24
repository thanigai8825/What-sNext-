import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { SettingsButton } from '../components/SettingsButton'
import { Button, Input, LargeTitle, MicroLabel, Page, ProgressBar, Sheet } from '../design'
import { allStepsDone, goalProgress } from '../engine/explain'
import { parseGoalInput } from '../engine/parse'
import { dateLabel, daysBetween, fromDayKey, weekdayName } from '../engine/time'
import type { Goal } from '../engine/types'
import { spring, tBase } from '../lib/motion'
import { useApp } from '../store/app'
import { withUndo } from '../store/ui'

export function GoalsScreen() {
  const goals = useApp((s) => s.goals)
  const tasks = useApp((s) => s.tasks)
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const active = goals.filter((g) => !g.completedAt).sort((a, b) => a.position - b.position)
  const achieved = goals.filter((g) => g.completedAt)

  return (
    <Page>
      <LargeTitle accessory={<SettingsButton />}>Goals</LargeTitle>
      {active.length === 0 && <p className="mb-6 text-body text-ink-2">What are you working toward? Add up to three goals.</p>}
      <ul className="space-y-4">
        <AnimatePresence initial={false}>
          {active.map((g, i) => (
            <motion.li key={g.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0, transition: { ...tBase, delay: i * 0.05 } }} exit={{ opacity: 0, scale: 0.98 }} transition={spring}>
              <GoalCard
                goal={g}
                progress={goalProgress(g.id, tasks)}
                planned={allStepsDone(g.id, tasks)}
                wins={tasks.filter((t) => t.goalId === g.id && t.status === 'done')}
                onOpen={() => setEditing(g)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {active.length < 3 && (
        <Button variant={active.length ? 'secondary' : 'primary'} icon={Plus} className="mt-6" full={!active.length} onClick={() => setEditing('new')}>
          Add a goal
        </Button>
      )}
      {achieved.length > 0 && (
        <section className="mt-12">
          <MicroLabel as="h2" className="mb-3">
            Achieved
          </MicroLabel>
          <ul className="space-y-2">
            {achieved.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => setEditing(g)} className="text-left text-body text-ink-2 transition-colors hover:text-ink">
                  {g.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <GoalSheet goal={editing} onClose={() => setEditing(null)} />
    </Page>
  )
}

function GoalCard({
  goal,
  progress,
  planned,
  wins,
  onOpen,
}: {
  goal: Goal
  progress: number
  planned: boolean
  wins: Array<{ id: string; title: string; completedAt: string | null }>
  onOpen: () => void
}) {
  const now = new Date()
  const days = goal.deadline ? daysBetween(now, fromDayKey(goal.deadline)) : null
  const recent = [...wins].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).slice(0, 3)
  return (
    <motion.button type="button" onClick={onOpen} whileTap={{ scale: 0.99 }} className="w-full rounded-card bg-surface p-5 text-left transition-colors duration-200 hover:bg-surface-hover">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-headline font-semibold text-ink text-balance">{goal.title}</h2>
        <span className="pt-0.5 text-caption font-medium text-ink tabular">{progress}%</span>
      </div>
      <p className="mt-0.5 text-caption text-ink-2">
        {goal.deadline ? `Due ${dateLabel(goal.deadline, now)}${days !== null && days > 1 ? ` · ${days} days left` : ''}` : 'No deadline'}
      </p>
      <ProgressBar value={progress} className="mt-4" label={`${goal.title} progress`} />
      {planned && <p className="mt-2 text-caption text-ink-2">Every planned step is done. Add what’s next, or mark it achieved.</p>}
      <div className="mt-5">
        <MicroLabel className="mb-1.5">Recent wins</MicroLabel>
        {recent.length ? (
          <ul className="space-y-1">
            {recent.map((t) => (
              <li key={t.id} className="flex gap-2 text-caption text-ink-2">
                <span className="truncate">{t.title}</span>
                {t.completedAt && <span className="shrink-0 text-ink-3">· {winDay(t.completedAt)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-ink-3">No wins yet. The first one is on the Now screen.</p>
        )}
      </div>
    </motion.button>
  )
}

function winDay(iso: string) {
  const d = new Date(iso)
  const diff = daysBetween(d, new Date())
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return weekdayName(d)
  return dateLabel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, new Date())
}

function GoalSheet({ goal, onClose }: { goal: Goal | 'new' | null; onClose: () => void }) {
  return (
    <Sheet open={goal !== null} onClose={onClose} label={goal === 'new' ? 'New goal' : 'Edit goal'}>
      {goal !== null && <GoalForm key={goal === 'new' ? 'new' : goal.id} goal={goal === 'new' ? null : goal} onClose={onClose} />}
    </Sheet>
  )
}

function GoalForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const [title, setTitle] = useState(goal?.title ?? '')
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const save = () => {
    const parsed = parseGoalInput(title, new Date())
    const t = parsed.title || title.trim()
    if (!t) return
    const d = deadline || parsed.deadline || null
    const app = useApp.getState()
    if (goal) app.updateGoal(goal.id, { title: t, deadline: d })
    else withUndo('Goal added', () => app.addGoal(t, d))
    onClose()
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <MicroLabel className="mb-3">{goal ? 'Goal' : 'New goal'}</MicroLabel>
      <Input data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Launch my portfolio by Oct 30" aria-label="Goal" />
      <label className="relative mt-3 flex h-12 items-center justify-between rounded-control bg-surface px-4">
        <span className="text-body text-ink">Deadline</span>
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="relative bg-transparent text-right text-body text-ink-2 outline-none" />
      </label>
      <Button type="submit" full className="mt-6" disabled={!title.trim()}>
        {goal ? 'Save' : 'Add goal'}
      </Button>
      {goal && (
        <div className="mt-2 flex items-center justify-center">
          <Button
            variant="text"
            onClick={() => {
              onClose()
              withUndo(goal.completedAt ? 'Goal reopened' : 'Goal achieved. Well done!', () =>
                useApp.getState().updateGoal(goal.id, { completedAt: goal.completedAt ? null : new Date().toISOString() }),
              )
            }}
          >
            {goal.completedAt ? 'Reopen goal' : 'Mark achieved'}
          </Button>
          <span aria-hidden className="text-faint">
            ·
          </span>
          <Button
            variant="text"
            onClick={() => {
              onClose()
              withUndo('Goal deleted', () => useApp.getState().deleteGoal(goal.id))
            }}
          >
            Delete
          </Button>
        </div>
      )}
    </form>
  )
}
