import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { validInsights } from '../engine/aiKey'
import { newGoal, newTask } from '../engine/factory'
import { deriveSignals } from '../engine/kb'
import { resolveAfter, type ParsedTask } from '../engine/parse'
import { pickReward, type Reward, type RewardKind } from '../engine/rewards'
import { rank } from '../engine/score'
import { addDays, atHour, dayKey } from '../engine/time'
import { keywords } from '../engine/text'
import type {
  AIInsight,
  EngineInput,
  Goal,
  KBField,
  KBFieldKey,
  KBSignals,
  KnowledgeBase,
  Learning,
  Rating,
  RatingValue,
  SessionContext,
  SkipEvent,
  SkipReason,
  Task,
} from '../engine/types'
import { uid } from '../lib/id'

export type Theme = 'light' | 'dark' | 'system'

export interface Settings {
  theme: Theme
  name: string
  morningEnabled: boolean
  morningTime: string
  nudgesEnabled: boolean
  eveningEnabled: boolean
  eveningTime: string
  dayEndHour: number
}

export interface Meta {
  firstOpenAt: string
  activeDays: string[]
  lastActiveAt: number
  lastRewardKind: RewardKind | null
  lastEveningCheck: string | null
  lastMorningNotified: string | null
  kbSkippedAt: string | null
  kbReoffered: boolean
  onboardedAt: string | null
}

export interface FocusSession {
  taskId: string
  /** epoch ms when the current running stretch began; null while paused */
  runningSince: number | null
  /** ms banked from earlier stretches */
  banked: number
}

export interface Data {
  onboarded: boolean
  goals: Goal[]
  tasks: Task[]
  ratings: Rating[]
  skips: SkipEvent[]
  kb: KnowledgeBase | null
  settings: Settings
  session: SessionContext
  learning: Learning
  plans: Record<string, string>
  ai: Record<string, AIInsight>
  meta: Meta
  focus: FocusSession | null
  /** The task on the focus card. Sticky, so the answer doesn't flicker as time passes. */
  currentId: string | null
}

export type Snapshot = Omit<Data, 'settings'>

interface Actions {
  finishOnboarding(): void
  setGoalsFromOnboarding(goals: Array<{ title: string; deadline: string | null }>): void
  addGoal(title: string, deadline: string | null): string
  updateGoal(id: string, patch: Partial<Pick<Goal, 'title' | 'deadline' | 'completedAt'>>): void
  deleteGoal(id: string): void

  addParsedTasks(parsed: ParsedTask[]): string[]
  updateTask(id: string, patch: Partial<Task>, lock?: Task['locked']): void
  deleteTask(id: string): void
  completeTask(id: string): Reward | null
  reopenTask(id: string): void
  notNow(id: string, reason: SkipReason): void
  rate(taskId: string, value: RatingValue): void
  reorder(taskId: string, aboveScore: number | null, belowScore: number | null, rawScore: number): void

  setKB(raw: string, fields: KBField[], signals?: KBSignals): void
  updateKBField(key: KBFieldKey, patch: Partial<KBField>): void
  removeKBField(key: KBFieldKey): void
  mergeKBSignals(signals: Partial<KBSignals>): void
  deleteKB(): void
  skipKB(): void
  markKBReoffered(): void

  setSettings(patch: Partial<Settings>): void
  setPlan(day: string, taskId: string): void
  setCurrent(id: string | null): void
  markEveningChecked(): void
  markMorningNotified(): void
  markActive(): void

  startFocus(taskId: string): void
  pauseFocus(): void
  resumeFocus(): void
  stopFocus(): void

  applyAI(insights: Record<string, AIInsight>): void

  snapshot(): Snapshot
  restore(s: Snapshot): void
  resetAll(): void
}

export type AppState = Data & Actions

const nowIso = () => new Date().toISOString()

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  name: '',
  morningEnabled: false,
  morningTime: '08:30',
  nudgesEnabled: true,
  eveningEnabled: true,
  eveningTime: '17:30',
  dayEndHour: 18,
}

function initialData(): Data {
  return {
    onboarded: false,
    goals: [],
    tasks: [],
    ratings: [],
    skips: [],
    kb: null,
    settings: DEFAULT_SETTINGS,
    session: { shortOnTimeUntil: null, availableMinutes: null, lowEnergyUntil: null },
    learning: { goalAffinity: {} },
    plans: {},
    ai: {},
    meta: {
      firstOpenAt: nowIso(),
      activeDays: [dayKey()],
      lastActiveAt: Date.now(),
      lastRewardKind: null,
      lastEveningCheck: null,
      lastMorningNotified: null,
      kbSkippedAt: null,
      kbReoffered: false,
      onboardedAt: null,
    },
    focus: null,
    currentId: null,
  }
}

const SNAPSHOT_KEYS: Array<keyof Snapshot> = [
  'onboarded',
  'goals',
  'tasks',
  'ratings',
  'skips',
  'kb',
  'session',
  'learning',
  'plans',
  'ai',
  'meta',
  'focus',
  'currentId',
]

export function engineInput(s: Data, now = new Date()): EngineInput {
  return {
    now,
    goals: s.goals,
    tasks: s.tasks,
    ratings: s.ratings,
    skips: s.skips,
    kb: s.kb,
    session: s.session,
    learning: s.learning,
    plans: s.plans,
    ai: validInsights(s.tasks, s.goals, s.kb, s.ai),
    dayEndHour: s.settings.dayEndHour,
  }
}

const clampAffinity = (x: number) => Math.max(-0.15, Math.min(0.15, x))

export const useApp = create<AppState>()(
  persist(
    (set, get) => {
      const patchTask = (id: string, fn: (t: Task) => Task) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...fn(t), updatedAt: nowIso() } : t)) }))

      /** Bank the running stretch of a focus session into the task. */
      const bankFocus = () => {
        const f = get().focus
        if (!f) return
        const extra = f.banked + (f.runningSince ? Date.now() - f.runningSince : 0)
        if (extra > 0) patchTask(f.taskId, (t) => ({ ...t, focusMs: t.focusMs + extra }))
      }

      return {
        ...initialData(),

        finishOnboarding: () => set((s) => ({ onboarded: true, meta: { ...s.meta, onboardedAt: nowIso() } })),

        setGoalsFromOnboarding: (list) => {
          const existing = get().goals
          const goals = list.map((g, i) => {
            const prev = existing[i]
            return prev ? { ...prev, title: g.title, deadline: g.deadline, position: i, updatedAt: nowIso() } : newGoal(g.title, g.deadline, i)
          })
          set({ goals })
        },

        addGoal: (title, deadline) => {
          const pos = get().goals.reduce((m, g) => Math.max(m, g.position + 1), 0)
          const g = newGoal(title, deadline, pos)
          set((s) => ({ goals: [...s.goals, g] }))
          return g.id
        },

        updateGoal: (id, patch) =>
          set((s) => ({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch, updatedAt: nowIso() } : g)) })),

        deleteGoal: (id) =>
          set((s) => ({
            goals: s.goals.filter((g) => g.id !== id),
            tasks: s.tasks.map((t) => (t.goalId === id ? { ...t, goalId: null, updatedAt: nowIso() } : t)),
          })),

        addParsedTasks: (parsed) => {
          const now = new Date()
          const created = parsed.map((p) => newTask(p, now))
          const pool = [...get().tasks.filter((t) => t.status === 'open'), ...created]
          parsed.forEach((p, i) => {
            if (!p.after) return
            const dep = resolveAfter(p.after, pool, created[i].id)
            if (dep) created[i].blockedBy = [dep]
            else created[i].title = p.fullTitle
          })
          set((s) => ({ tasks: [...s.tasks, ...created], currentId: null }))
          return created.map((t) => t.id)
        },

        updateTask: (id, patch, lock) =>
          patchTask(id, (t) => ({ ...t, ...patch, locked: lock ? [...new Set([...t.locked, ...lock])] : t.locked })),

        deleteTask: (id) =>
          set((s) => ({
            tasks: s.tasks.filter((t) => t.id !== id).map((t) => (t.blockedBy.includes(id) ? { ...t, blockedBy: t.blockedBy.filter((b) => b !== id) } : t)),
            currentId: s.currentId === id ? null : s.currentId,
            focus: s.focus?.taskId === id ? null : s.focus,
          })),

        completeTask: (id) => {
          const s = get()
          const task = s.tasks.find((t) => t.id === id)
          if (!task || task.status === 'done') return null
          if (s.focus?.taskId === id) bankFocus()
          const before = get().tasks
          const completedAt = nowIso()
          const after = before.map((t) => (t.id === id ? { ...t, status: 'done' as const, completedAt, updatedAt: completedAt } : t))
          const done = after.find((t) => t.id === id)!
          const reward = pickReward({
            task: done,
            before,
            after,
            goals: s.goals,
            ratings: s.ratings,
            now: new Date(),
            last: s.meta.lastRewardKind,
          })
          set({
            tasks: after,
            focus: s.focus?.taskId === id ? null : s.focus,
            currentId: null,
            meta: { ...s.meta, lastRewardKind: reward.kind },
            // Finishing something resets short-lived "no time" context.
            session: { ...s.session, shortOnTimeUntil: null, availableMinutes: null },
          })
          return reward
        },

        reopenTask: (id) => patchTask(id, (t) => ({ ...t, status: 'open', completedAt: null })),

        notNow: (id, reason) => {
          const s = get()
          const task = s.tasks.find((t) => t.id === id)
          if (!task) return
          const now = new Date()
          const inH = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString()
          const skip: SkipEvent = { id: uid(), taskId: id, reason, hour: now.getHours(), category: task.category, createdAt: now.toISOString() }
          let session = s.session
          let patch: Partial<Task> = {}
          if (reason === 'no_time') {
            // The next pick should fit comfortably in less time than this one needed.
            const mins = Math.max(10, Math.min(30, Math.round(task.effort * 0.5)))
            session = { ...session, shortOnTimeUntil: now.getTime() + 90 * 60_000, availableMinutes: mins }
            patch = { snoozedUntil: inH(1.5) }
          } else if (reason === 'low_energy') {
            session = { ...session, lowEnergyUntil: now.getTime() + 2 * 3_600_000 }
            patch = { snoozedUntil: inH(2) }
          } else if (reason === 'blocked') {
            patch = { blockedUntil: atHour(addDays(now, 1), 9).toISOString() }
          } else {
            patch = { notImportant: task.notImportant + 1, snoozedUntil: atHour(addDays(now, 1), 6).toISOString() }
          }
          const affinity = { ...s.learning.goalAffinity }
          if (reason === 'not_important' && task.goalId) affinity[task.goalId] = clampAffinity((affinity[task.goalId] ?? 0) - 0.03)
          set({
            skips: [...s.skips, skip],
            session,
            learning: { goalAffinity: affinity },
            tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: nowIso() } : t)),
            currentId: null,
          })
        },

        rate: (taskId, value) => {
          const s = get()
          const task = s.tasks.find((t) => t.id === taskId)
          if (!task) return
          const at = task.completedAt ? new Date(task.completedAt) : new Date()
          const rating: Rating = {
            id: uid(),
            taskId,
            value,
            hour: at.getHours(),
            category: task.category,
            goalId: task.goalId,
            keywords: keywords(task.title),
            effort: task.effort,
            createdAt: nowIso(),
          }
          const affinity = { ...s.learning.goalAffinity }
          if (task.goalId) affinity[task.goalId] = clampAffinity((affinity[task.goalId] ?? 0) + (value - 1) * 0.02)
          set({ ratings: [...s.ratings.filter((r) => r.taskId !== taskId), rating], learning: { goalAffinity: affinity } })
        },

        reorder: (taskId, aboveScore, belowScore, rawScore) => {
          // Place the task between its new neighbours by nudging its bias.
          let target: number
          if (aboveScore !== null && belowScore !== null) target = (aboveScore + belowScore) / 2
          else if (aboveScore !== null) target = aboveScore - 0.02
          else if (belowScore !== null) target = belowScore + 0.02
          else return
          const s = get()
          const task = s.tasks.find((t) => t.id === taskId)
          if (!task) return
          const bias = Math.max(-1, Math.min(1, target - (rawScore - task.userBias)))
          const affinity = { ...s.learning.goalAffinity }
          if (task.goalId) affinity[task.goalId] = clampAffinity((affinity[task.goalId] ?? 0) + (bias > task.userBias ? 0.02 : -0.02))
          set({
            tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, userBias: bias, updatedAt: nowIso() } : t)),
            learning: { goalAffinity: affinity },
            currentId: null,
          })
        },

        setKB: (raw, fields, signals) => {
          const now = nowIso()
          set({ kb: { raw, fields, signals: signals ?? deriveSignals(fields), importedAt: now, updatedAt: now }, currentId: null })
        },

        updateKBField: (key, patch) =>
          set((s) => {
            if (!s.kb) return {}
            const fields = s.kb.fields.map((f) => (f.key === key ? { ...f, ...patch } : f))
            return { kb: { ...s.kb, fields, signals: patch.value !== undefined ? deriveSignals(fields) : s.kb.signals, updatedAt: nowIso() } }
          }),

        removeKBField: (key) =>
          set((s) => {
            if (!s.kb) return {}
            const fields = s.kb.fields.filter((f) => f.key !== key)
            return { kb: { ...s.kb, fields, signals: deriveSignals(fields), updatedAt: nowIso() } }
          }),

        mergeKBSignals: (signals) =>
          set((s) => {
            if (!s.kb) return {}
            const merge = (a: string[], b?: string[]) => [...new Set([...(b ?? []), ...a])].slice(0, 16)
            const cur = s.kb.signals
            return {
              kb: {
                ...s.kb,
                signals: {
                  highValue: merge(cur.highValue, signals.highValue),
                  avoid: merge(cur.avoid, signals.avoid),
                  busywork: merge(cur.busywork, signals.busywork),
                  peak: signals.peak ?? cur.peak,
                },
              },
            }
          }),

        deleteKB: () => set({ kb: null, currentId: null }),
        skipKB: () => set((s) => ({ meta: { ...s.meta, kbSkippedAt: s.meta.kbSkippedAt ?? nowIso() } })),
        markKBReoffered: () => set((s) => ({ meta: { ...s.meta, kbReoffered: true } })),

        setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        setPlan: (day, taskId) => set((s) => ({ plans: { ...s.plans, [day]: taskId } })),
        setCurrent: (id) => set({ currentId: id }),
        markEveningChecked: () => set((s) => ({ meta: { ...s.meta, lastEveningCheck: dayKey() } })),
        markMorningNotified: () => set((s) => ({ meta: { ...s.meta, lastMorningNotified: dayKey() } })),
        markActive: () =>
          set((s) => {
            const today = dayKey()
            const days = s.meta.activeDays.includes(today) ? s.meta.activeDays : [...s.meta.activeDays, today].slice(-60)
            return { meta: { ...s.meta, activeDays: days, lastActiveAt: Date.now() } }
          }),

        startFocus: (taskId) => {
          const f = get().focus
          if (f?.taskId === taskId) return
          if (f) bankFocus()
          set({ focus: { taskId, runningSince: Date.now(), banked: 0 }, currentId: taskId })
        },
        pauseFocus: () =>
          set((s) =>
            s.focus?.runningSince ? { focus: { ...s.focus, banked: s.focus.banked + Date.now() - s.focus.runningSince, runningSince: null } } : {},
          ),
        resumeFocus: () => set((s) => (s.focus && !s.focus.runningSince ? { focus: { ...s.focus, runningSince: Date.now() } } : {})),
        stopFocus: () => {
          bankFocus()
          set({ focus: null })
        },

        applyAI: (insights) =>
          set((s) => {
            // Keep the cache to tasks that still exist.
            const ids = new Set(s.tasks.map((t) => t.id))
            const ai: Record<string, AIInsight> = {}
            for (const [id, v] of Object.entries({ ...s.ai, ...insights })) if (ids.has(id)) ai[id] = v
            return { ai }
          }),

        snapshot: () => {
          const s = get()
          const snap = {} as Record<string, unknown>
          for (const k of SNAPSHOT_KEYS) snap[k] = s[k]
          return snap as unknown as Snapshot
        },
        restore: (snap) => set({ ...snap }),
        resetAll: () => set({ ...initialData(), settings: get().settings }),
      }
    },
    {
      name: 'whats-next',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const out = {} as Record<string, unknown>
        for (const k of [...SNAPSHOT_KEYS, 'settings'] as const) out[k] = s[k]
        return out as unknown as Data
      },
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Data>
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
          meta: { ...current.meta, ...(p.meta ?? {}) },
        }
      },
    },
  ),
)

/** Ranking for the current state. */
export function rankState(s: Data, now = new Date()) {
  return rank(engineInput(s, now))
}
