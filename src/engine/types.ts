export type Category = 'deep' | 'outreach' | 'admin' | 'learning' | 'meeting' | 'other'

export type Bucket = 'now' | 'next' | 'later' | 'skip'

export type SkipReason = 'no_time' | 'low_energy' | 'blocked' | 'not_important'

/** 0 = Little, 1 = Some, 2 = A lot */
export type RatingValue = 0 | 1 | 2

export interface Goal {
  id: string
  title: string
  /** YYYY-MM-DD */
  deadline: string | null
  position: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface Task {
  id: string
  title: string
  notes: string
  goalId: string | null
  /** ISO datetime. Date-only deadlines are stored at the end of the work day. */
  due: string | null
  dueHasTime: boolean
  /** minutes */
  effort: number
  effortGuessed: boolean
  category: Category
  person: string | null
  status: 'open' | 'done'
  blockedBy: string[]
  blockedUntil: string | null
  snoozedUntil: string | null
  /** Nudge from manual reordering. */
  userBias: number
  /** Times the user said "Not important". */
  notImportant: number
  /** Accumulated focus time in ms. */
  focusMs: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  /** Fields the user has edited by hand; AI refinement leaves these alone. */
  locked: Array<'title' | 'due' | 'effort' | 'goalId'>
}

export interface Rating {
  id: string
  taskId: string
  value: RatingValue
  /** local hour of completion 0–23 */
  hour: number
  category: Category
  goalId: string | null
  keywords: string[]
  effort: number
  createdAt: string
}

export interface SkipEvent {
  id: string
  taskId: string
  reason: SkipReason
  hour: number
  category: Category
  createdAt: string
}

export type KBFieldKey = 'goals' | 'role' | 'highValue' | 'avoidance' | 'energy' | 'constraints' | 'style'

export interface KBField {
  key: KBFieldKey
  value: string
  confirmed: boolean
}

export interface KBSignals {
  highValue: string[]
  avoid: string[]
  busywork: string[]
  /** Hours [start, end) the user says they focus best, local time. */
  peak: [number, number] | null
}

export interface KnowledgeBase {
  raw: string
  fields: KBField[]
  signals: KBSignals
  importedAt: string
  updatedAt: string
}

/** Short-lived context from "Not now" taps. Adjusts the next pick immediately. */
export interface SessionContext {
  /** epoch ms; until then, prefer tasks that fit `availableMinutes` */
  shortOnTimeUntil: number | null
  availableMinutes: number | null
  lowEnergyUntil: number | null
}

export interface AIInsight {
  key: string
  impact: number
  reason: string
  now: string
  delay: string
  at: number
}

export interface Learning {
  /** −0.15…0.15 per goal, learned from reorders and ratings */
  goalAffinity: Record<string, number>
}

export interface EngineInput {
  now: Date
  goals: Goal[]
  tasks: Task[]
  ratings: Rating[]
  skips: SkipEvent[]
  kb: KnowledgeBase | null
  session: SessionContext
  learning: Learning
  /** YYYY-MM-DD → taskId the user chose to start that day with */
  plans: Record<string, string>
  ai: Record<string, AIInsight>
  /** Local hour the work day ends, e.g. 18 */
  dayEndHour: number
}

export type FactorKey = 'impact' | 'urgency' | 'unblock' | 'fit' | 'energy' | 'ratings' | 'kb'

export interface KBMatch {
  kind: 'avoid' | 'highValue' | 'busywork'
  phrase: string
}

export interface Ranked {
  task: Task
  score: number
  factors: Record<FactorKey, number>
  weights: Record<FactorKey, number>
  bucket: Bucket
  /** False when blocked, waiting or snoozed. */
  available: boolean
  waitingOn: Task[]
  dependents: Task[]
  kbMatch: KBMatch | null
  planned: boolean
  hoursToDue: number | null
}
