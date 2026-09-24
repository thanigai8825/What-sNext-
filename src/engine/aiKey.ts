import { hash } from '../lib/id'
import type { AIInsight, Goal, KnowledgeBase, Task } from './types'

/** Identifies the version of a task (and its world) an AI judgment was made for. */
export function aiKey(task: Task, goals: Goal[], kb: KnowledgeBase | null): string {
  const g = task.goalId ? goals.find((x) => x.id === task.goalId) : null
  return hash(
    [task.title, task.due ?? '', task.effort, task.goalId ?? '', g?.title ?? '', g?.deadline ?? '', task.blockedBy.join(','), task.notImportant, kb?.updatedAt ?? ''].join('|'),
  )
}

/** Only insights that still describe the task as it is now. */
export function validInsights(tasks: Task[], goals: Goal[], kb: KnowledgeBase | null, ai: Record<string, AIInsight>) {
  const out: Record<string, AIInsight> = {}
  for (const t of tasks) {
    const i = ai[t.id]
    if (i && i.key === aiKey(t, goals, kb)) out[t.id] = i
  }
  return out
}
