import { uid } from '../lib/id'
import type { ParsedTask } from './parse'
import type { Goal, Task } from './types'

export function newTask(p: Partial<ParsedTask> & { title: string }, now = new Date()): Task {
  const iso = now.toISOString()
  return {
    id: uid(),
    title: p.title,
    notes: '',
    goalId: p.goalId ?? null,
    due: p.due ?? null,
    dueHasTime: p.dueHasTime ?? false,
    effort: p.effort ?? 30,
    effortGuessed: p.effortGuessed ?? true,
    category: p.category ?? 'other',
    person: p.person ?? null,
    status: 'open',
    blockedBy: [],
    blockedUntil: null,
    snoozedUntil: null,
    userBias: 0,
    notImportant: 0,
    focusMs: 0,
    createdAt: iso,
    updatedAt: iso,
    completedAt: null,
    locked: [],
  }
}

export function newGoal(title: string, deadline: string | null, position: number, now = new Date()): Goal {
  const iso = now.toISOString()
  return { id: uid(), title, deadline, position, createdAt: iso, updatedAt: iso, completedAt: null }
}
