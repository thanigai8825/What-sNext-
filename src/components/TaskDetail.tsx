import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ChevronsUpDown } from 'lucide-react'
import { Button, Input, MicroLabel, Sheet, TextArea } from '../design'
import { whyBucket } from '../engine/explain'
import { atHour, dayKey, effortLabel, fromDayKey } from '../engine/time'
import type { Task } from '../engine/types'
import { useApp } from '../store/app'
import { useRanked } from '../store/selectors'
import { withUndo } from '../store/ui'

const EFFORTS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360]

export function TaskDetailSheet({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const exists = useApp((s) => !!taskId && s.tasks.some((t) => t.id === taskId))
  return (
    <Sheet open={!!taskId && exists} onClose={onClose} label="Task details">
      {taskId && <Detail id={taskId} onClose={onClose} />}
    </Sheet>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="relative flex min-h-[52px] items-center gap-3 px-4">
      <span className="flex-1 text-body text-ink">{label}</span>
      {children}
    </label>
  )
}

const selectCls =
  'max-w-[60%] cursor-pointer appearance-none truncate bg-transparent pr-6 text-right text-body text-ink-2 outline-none focus-visible:text-ink'

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const navigate = useNavigate()
  const task = useApp((s) => s.tasks.find((t) => t.id === id)) as Task | undefined
  const goals = useApp((s) => s.goals)
  const openTasks = useApp((s) => s.tasks.filter((t) => t.status === 'open' && t.id !== id))
  const dayEndHour = useApp((s) => s.settings.dayEndHour)
  const { ranked, input } = useRanked()
  const [title, setTitle] = useState(task?.title ?? '')
  const [notes, setNotes] = useState(task?.notes ?? '')

  useEffect(() => setTitle(task?.title ?? ''), [task?.title])

  if (!task) return null
  const r = ranked.find((x) => x.task.id === id)
  const why = r ? whyBucket(r, input) : null
  const update = (patch: Partial<Task>, lock?: Task['locked']) => useApp.getState().updateTask(id, patch, lock)
  const commitTitle = () => {
    const t = title.trim()
    if (t && t !== task.title) update({ title: t }, ['title'])
    else setTitle(task.title)
  }

  return (
    <div>
      <MicroLabel className="mb-3">{task.status === 'done' ? 'Done' : 'Task'}</MicroLabel>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        aria-label="Title"
        className="h-auto min-h-12 py-2.5 text-headline font-semibold"
      />

      {why && task.status === 'open' && (
        <div className="mt-4 rounded-inner bg-sky-bg px-4 py-3.5">
          <MicroLabel color="text-sky">{why.label}</MicroLabel>
          <p className="mt-1 text-body text-sky">{why.text}</p>
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-card bg-surface [&>*+*]:border-t [&>*+*]:border-line">
        <Row label="Goal">
          <select className={selectCls} value={task.goalId ?? ''} onChange={(e) => update({ goalId: e.target.value || null }, ['goalId'])}>
            <option value="">None</option>
            {goals
              .filter((g) => !g.completedAt)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
          </select>
          <ChevronsUpDown size={16} strokeWidth={1.5} className="pointer-events-none absolute right-4 text-faint" aria-hidden />
        </Row>
        <Row label="Deadline">
          <span className="relative">
            <input
              type="date"
              className="relative max-w-[60%] cursor-pointer bg-transparent pr-6 text-right text-body text-ink-2 outline-none [color-scheme:inherit]"
              value={task.due ? dayKey(new Date(task.due)) : ''}
              onChange={(e) => update({ due: e.target.value ? atHour(fromDayKey(e.target.value), dayEndHour).toISOString() : null, dueHasTime: false }, ['due'])}
            />
          </span>
          {task.due && (
            <button type="button" className="text-caption text-ink-3 hover:text-ink" onClick={() => update({ due: null }, ['due'])}>
              Clear
            </button>
          )}
        </Row>
        <Row label="Effort">
          <select className={selectCls} value={task.effort} onChange={(e) => update({ effort: Number(e.target.value), effortGuessed: false }, ['effort'])}>
            {[...new Set([...EFFORTS, task.effort])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {effortLabel(m)}
                </option>
              ))}
          </select>
          <ChevronsUpDown size={16} strokeWidth={1.5} className="pointer-events-none absolute right-4 text-faint" aria-hidden />
        </Row>
        <Row label="Waiting on">
          <select className={selectCls} value={task.blockedBy[0] ?? ''} onChange={(e) => update({ blockedBy: e.target.value ? [e.target.value] : [] })}>
            <option value="">Nothing</option>
            {openTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <ChevronsUpDown size={16} strokeWidth={1.5} className="pointer-events-none absolute right-4 text-faint" aria-hidden />
        </Row>
      </div>

      <TextArea
        className="mt-3"
        minRows={2}
        value={notes}
        placeholder="Notes"
        aria-label="Notes"
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== task.notes && update({ notes })}
      />

      {task.status === 'open' ? (
        <Button
          full
          className="mt-6"
          onClick={() => {
            useApp.getState().startFocus(id)
            onClose()
            navigate('/focus')
          }}
        >
          Start
        </Button>
      ) : (
        <Button full variant="secondary" className="mt-6" onClick={() => withUndo('Reopened', () => useApp.getState().reopenTask(id))}>
          Reopen
        </Button>
      )}
      <div className="mt-2 flex items-center justify-center">
        {task.status === 'open' && (
          <>
            <Button
              variant="text"
              onClick={() => {
                onClose()
                withUndo('Task completed', () => useApp.getState().completeTask(id))
              }}
            >
              Mark done
            </Button>
            <span aria-hidden className="text-faint">
              ·
            </span>
          </>
        )}
        <Button
          variant="text"
          onClick={() => {
            onClose()
            withUndo('Task deleted', () => useApp.getState().deleteTask(id))
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}
