import { aiKey } from '../engine/aiKey'
import { KB_FIELDS } from '../engine/kb'
import { availableMinutes, currentEnergy, rank } from '../engine/score'
import { pad } from '../engine/time'
import type { AIInsight, Category, KBSignals, KnowledgeBase, Task } from '../engine/types'
import { engineInput, useApp } from '../store/app'
import { useUI } from '../store/ui'
import { checkAI, partialField, streamNDJSON } from './client'

/**
 * The AI layer. The local engine always answers instantly; Claude refines it:
 * cleaner parsing, a judgment of real impact, and better-worded reasons.
 * Everything here fails quietly back to the local engine.
 */

const CATEGORIES: Category[] = ['deep', 'outreach', 'admin', 'learning', 'meeting', 'other']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function localStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())} (${WEEKDAYS[d.getDay()]})`
}

function localIso(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function profileText(kb: KnowledgeBase | null): string | null {
  if (!kb) return null
  return kb.fields.map((f) => `${KB_FIELDS.find((x) => x.key === f.key)?.header}: ${f.value}`).join('\n')
}

function goalsPayload() {
  const { goals } = useApp.getState()
  return goals
    .filter((g) => !g.completedAt)
    .sort((a, b) => a.position - b.position)
    .map((g, i) => ({ id: g.id, title: g.title, deadline: g.deadline, rank: i + 1 }))
}

const clamp01 = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0.5)
const tidy = (s: unknown) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').replace(/!+/g, '.') : '')

export async function initAI() {
  const on = await checkAI()
  useUI.getState().setAIEnabled(on)
  if (on) scheduleRanking(300)
}

const aiOn = () => useUI.getState().aiEnabled === true

// ── Parsing ──────────────────────────────────────────────────────────────────

interface ParsedAI {
  i: number
  title?: string
  due?: string | null
  dueHasTime?: boolean
  effort?: number
  goalId?: string | null
  person?: string | null
  category?: string
  after?: number | null
}

function parseInput(lines: string[]) {
  const s = useApp.getState()
  return {
    now: localStamp(),
    dayEndHour: s.settings.dayEndHour,
    goals: goalsPayload(),
    profile: profileText(s.kb),
    lines,
  }
}

function toPatch(it: ParsedAI, task: Task, ids: string[]): Partial<Task> {
  const { goals } = useApp.getState()
  const patch: Partial<Task> = {}
  if (!task.locked.includes('title') && typeof it.title === 'string' && it.title.trim()) patch.title = it.title.trim().slice(0, 120)
  if (!task.locked.includes('due') && it.due !== undefined) {
    const d = it.due ? new Date(it.due) : null
    if (!d || !Number.isNaN(d.getTime())) {
      patch.due = d ? d.toISOString() : null
      patch.dueHasTime = !!it.dueHasTime
    }
  }
  if (!task.locked.includes('effort') && typeof it.effort === 'number' && it.effort > 0) patch.effort = Math.min(600, Math.max(5, Math.round(it.effort)))
  if (!task.locked.includes('goalId') && it.goalId !== undefined) {
    if (it.goalId === null || goals.some((g) => g.id === it.goalId)) patch.goalId = it.goalId
  }
  if (it.person !== undefined) patch.person = typeof it.person === 'string' && it.person ? it.person : null
  if (typeof it.category === 'string' && (CATEGORIES as string[]).includes(it.category)) patch.category = it.category as Category
  if (typeof it.after === 'number' && ids[it.after] && ids[it.after] !== task.id && !task.blockedBy.length) patch.blockedBy = [ids[it.after]]
  return patch
}

/** Refine freshly added tasks in place, line by line as the model streams. */
export async function refineTasks(ids: string[], lines: string[], onLine?: (id: string) => void) {
  if (!aiOn() || !ids.length) return
  try {
    await streamNDJSON<ParsedAI>('parse_tasks', parseInput(lines), {
      onItem: (it) => {
        const id = ids[it.i]
        const task = useApp.getState().tasks.find((t) => t.id === id)
        if (!task) return
        const patch = toPatch(it, task, ids)
        if (Object.keys(patch).length) useApp.getState().updateTask(id, patch)
        onLine?.(id)
      },
    })
  } catch {
    /* local parse stands */
  }
}

/** Suggestions for the quick-add field while the person types. */
export async function suggest(line: string, signal: AbortSignal): Promise<ParsedAI | null> {
  if (!aiOn() || line.trim().length < 4) return null
  try {
    const items = await streamNDJSON<ParsedAI>('parse_tasks', parseInput([line]), { signal })
    return items[0] ?? null
  } catch {
    return null
  }
}

// ── Ranking ──────────────────────────────────────────────────────────────────

interface RankAI {
  id: string
  impact?: number
  reason?: string
  now?: string
  delay?: string
}

let timer: number | undefined
let inflight: AbortController | null = null

export function scheduleRanking(delay = 1200) {
  if (!aiOn()) return
  window.clearTimeout(timer)
  timer = window.setTimeout(runRanking, delay)
}

async function runRanking() {
  const s = useApp.getState()
  const open = s.tasks.filter((t) => t.status === 'open')
  const stale = open.filter((t) => s.ai[t.id]?.key !== aiKey(t, s.goals, s.kb))
  if (!stale.length) return

  inflight?.abort()
  const ctrl = new AbortController()
  inflight = ctrl

  const input = engineInput(s)
  const ranked = rank(input).slice(0, 40)
  const keys = new Map(ranked.map((r) => [r.task.id, aiKey(r.task, s.goals, s.kb)]))
  const goalTitle = (id: string | null) => s.goals.find((g) => g.id === id)?.title ?? null
  const rated = s.ratings.slice(-12).map((r) => ({ task: s.tasks.find((t) => t.id === r.taskId)?.title, moved: ['little', 'some', 'a lot'][r.value] }))

  const payload = {
    now: localStamp(),
    availableMinutes: availableMinutes(input),
    energy: currentEnergy(input) < 0.45 ? 'low' : currentEnergy(input) > 0.75 ? 'high' : 'medium',
    goals: goalsPayload(),
    profile: profileText(s.kb),
    recentRatings: rated,
    tasks: ranked.map((r) => ({
      id: r.task.id,
      title: r.task.title,
      due: r.task.due ? localIso(r.task.due) : null,
      effortMinutes: r.task.effort,
      goal: goalTitle(r.task.goalId),
      category: r.task.category,
      person: r.task.person,
      waitingOn: r.waitingOn.map((w) => w.title),
      unblocks: r.dependents.map((d) => d.title),
      markedNotImportant: r.task.notImportant > 0 || undefined,
      notes: r.task.notes || undefined,
    })),
  }

  const ui = useUI.getState()
  ui.setAIBusy(true)
  try {
    await streamNDJSON<RankAI>('rank', payload, {
      signal: ctrl.signal,
      onItem: (it) => {
        const key = keys.get(it.id)
        if (!key) return
        const insight: AIInsight = {
          key,
          impact: clamp01(it.impact),
          reason: tidy(it.reason),
          now: tidy(it.now),
          delay: tidy(it.delay),
          at: Date.now(),
        }
        useApp.getState().applyAI({ [it.id]: insight })
      },
      onPartial: (line) => {
        const id = partialField(line, 'id')
        const reason = partialField(line, 'reason')
        if (id && reason) useUI.getState().setAIPartial(id, reason)
      },
    })
  } catch {
    /* keep local reasons */
  } finally {
    if (inflight === ctrl) {
      inflight = null
      useUI.getState().setAIBusy(false)
      useUI.getState().clearAIPartial()
    }
  }
}

// ── Profile ──────────────────────────────────────────────────────────────────

export async function refineProfile() {
  const kb = useApp.getState().kb
  if (!aiOn() || !kb) return
  try {
    const [first] = await streamNDJSON<Partial<KBSignals>>('profile', { profile: profileText(kb) })
    if (!first) return
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string').map((v) => v.toLowerCase().trim()) : [])
    const peak = Array.isArray(first.peak) && first.peak.length === 2 && first.peak.every((n) => typeof n === 'number') ? (first.peak as [number, number]) : null
    useApp.getState().mergeKBSignals({ highValue: list(first.highValue), avoid: list(first.avoid), busywork: list(first.busywork), peak })
  } catch {
    /* local signals stand */
  }
}
