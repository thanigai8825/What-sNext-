import { allStepsDone, goalName, goalProgress } from './explain'
import { timingInsight } from './insights'
import { dayKey, dueWords, durationLabel, hoursUntil } from './time'
import { numberWord, plural } from './text'
import type { Goal, Rating, Task } from './types'

export type RewardKind = 'progress' | 'unblocked' | 'insight' | 'pace' | 'momentum' | 'deadline' | 'done' | 'steady'

export interface Reward {
  kind: RewardKind
  title: string
  detail?: string
  progress?: { goal: Goal; before: number; after: number }
}

interface RewardInput {
  task: Task
  /** Task list before completion (task still open). */
  before: Task[]
  /** Task list after completion. */
  after: Task[]
  goals: Goal[]
  ratings: Rating[]
  now: Date
  last?: RewardKind | null
  rand?: () => number
}

const WEIGHT: Record<RewardKind, number> = {
  unblocked: 3,
  progress: 3,
  insight: 2,
  deadline: 1.5,
  pace: 1.5,
  momentum: 1,
  done: 0.2,
  steady: 0.2,
}

/** One varied reward after completion. Never the same kind twice in a row. */
export function pickReward(input: RewardInput): Reward {
  const { task, now } = input
  const options: Reward[] = []

  const goal = task.goalId ? input.goals.find((g) => g.id === task.goalId) : undefined
  if (goal) {
    const before = goalProgress(goal.id, input.before)
    const after = goalProgress(goal.id, input.after)
    if (after > before) {
      options.push({
        kind: 'progress',
        title: allStepsDone(goal.id, input.after) ? `Nice! Every planned step for “${goalName(goal)}” is done.` : `Nice. “${goalName(goal)}” is ${after}% there.`,
        progress: { goal, before, after },
      })
    }
  }

  const unblocked = input.after.filter(
    (t) =>
      t.status === 'open' &&
      t.blockedBy.includes(task.id) &&
      t.blockedBy.every((id) => input.after.find((x) => x.id === id)?.status !== 'open'),
  )
  if (unblocked.length) {
    options.push({
      kind: 'unblocked',
      title: `You unblocked ${plural(unblocked.length, 'task')}.`,
      detail: unblocked.slice(0, 2).map((t) => t.title).join(' · '),
    })
  }

  const insight = timingInsight(input.ratings)
  if (insight) options.push({ kind: 'insight', title: insight })

  if (task.focusMs > 60_000) {
    const planned = task.effort * 60_000
    if (task.focusMs < planned * 0.8) {
      options.push({
        kind: 'pace',
        title: `Done in ${durationLabel(task.focusMs)}, ${durationLabel(planned - task.focusMs)} faster than planned.`,
      })
    }
  }

  const today = dayKey(now)
  const doneToday = input.after.filter((t) => t.status === 'done' && t.completedAt && dayKey(new Date(t.completedAt)) === today && (t.goalId || t.due))
  if (doneToday.length >= 2) {
    options.push({ kind: 'momentum', title: `That's ${numberWord(doneToday.length)} things that matter, done today.` })
  }

  if (task.due) {
    const h = hoursUntil(task.due, now)
    if (h >= 0 && h <= 72) options.push({ kind: 'deadline', title: `One less thing due ${dueWords(task.due, now)}.` })
  }

  // Quiet fallbacks, so even an ordinary task never gets the same line twice.
  options.push({ kind: 'done', title: 'Done. One real step forward.' }, { kind: 'steady', title: 'Done. That one counts.' })
  const meaningful = options.filter((o) => o.kind !== 'done' && o.kind !== 'steady' && o.kind !== input.last)
  const pool = meaningful.length ? meaningful : options.filter((o) => o.kind !== input.last)
  const rand = input.rand ?? Math.random
  const total = pool.reduce((s, o) => s + WEIGHT[o.kind], 0)
  let x = rand() * total
  for (const o of pool) {
    x -= WEIGHT[o.kind]
    if (x <= 0) return o
  }
  return pool[pool.length - 1]
}
