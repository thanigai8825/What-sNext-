import { matchKB } from './kb'
import { atHour, dayKey, hoursUntil } from './time'
import { demand, jaccard, keywords } from './text'
import type { EngineInput, FactorKey, Goal, Ranked, Task } from './types'

/**
 * The prioritization engine.
 *
 * Seven factors, each 0–1, blended by weight. Goal impact dominates on purpose:
 * the failure we're fixing is picking easy, low-value work because it feels
 * productive. Urgency is second. Everything else breaks ties in ways that
 * respect the person's time, energy and history.
 */
export const BASE_WEIGHTS: Record<FactorKey, number> = {
  impact: 0.3,
  urgency: 0.22,
  unblock: 0.13,
  fit: 0.1,
  energy: 0.08,
  ratings: 0.09,
  kb: 0.08,
}

/** What each factor looks like when it isn't saying anything. Used to find the real drivers. */
export const NEUTRAL: Record<FactorKey, number> = {
  impact: 0.4,
  urgency: 0.12,
  unblock: 0,
  fit: 0.85,
  energy: 0.7,
  ratings: 0.5,
  kb: 0.5,
}

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x))

/** Observed behavior gradually overrides what the person told us about themselves. */
export function weightsFor(input: EngineInput): Record<FactorKey, number> {
  const w = { ...BASE_WEIGHTS }
  const n = input.ratings.length
  if (!input.kb) {
    w.impact += w.kb
    w.kb = 0
  } else {
    const kbW = BASE_WEIGHTS.kb * (6 / (6 + n))
    w.ratings += BASE_WEIGHTS.kb - kbW
    w.kb = kbW
  }
  return w
}

// ── Time & energy ────────────────────────────────────────────────────────────

export function isLowEnergy(input: EngineInput) {
  return !!input.session.lowEnergyUntil && input.session.lowEnergyUntil > input.now.getTime()
}

export function isShortOnTime(input: EngineInput) {
  return !!input.session.shortOnTimeUntil && input.session.shortOnTimeUntil > input.now.getTime()
}

/** Minutes the person realistically has right now. */
export function availableMinutes(input: EngineInput): number {
  if (isShortOnTime(input) && input.session.availableMinutes) return input.session.availableMinutes
  const now = input.now
  const end = atHour(now, input.dayEndHour)
  let mins = (end.getTime() - now.getTime()) / 60_000
  if (mins <= 0 || now.getHours() < 6) {
    // Evenings and early mornings: assume a modest window.
    mins = Math.min(120, (atHour(now, 23).getTime() - now.getTime()) / 60_000)
  }
  return Math.max(20, Math.round(mins))
}

const hourBucket = (h: number) => (h >= 5 && h < 12 ? 0 : h >= 12 && h < 15 ? 1 : h >= 15 && h < 18 ? 2 : 3)

function defaultCurve(h: number): number {
  if (h < 6) return 0.25
  if (h < 8) return 0.55
  if (h < 12) return 0.9
  if (h < 14) return 0.6
  if (h < 15) return 0.5
  if (h < 18) return 0.7
  if (h < 21) return 0.5
  return 0.3
}

/** Capacity for demanding work at this hour, 0–1. Prior from the profile, refined by behavior. */
export function energyAt(hour: number, input: EngineInput): number {
  const peak = input.kb?.signals.peak
  let prior = defaultCurve(hour)
  if (peak) {
    const inPeak = hour >= peak[0] && hour < peak[1]
    prior = inPeak ? 0.95 : Math.min(prior, 0.65)
  }
  const bucket = hourBucket(hour)
  const samples: number[] = []
  for (const r of input.ratings) {
    if (hourBucket(r.hour) !== bucket) continue
    samples.push(0.5 * (r.value / 2) + 0.5 * demand(r.category, r.effort))
  }
  for (const s of input.skips) if (s.reason === 'low_energy' && hourBucket(s.hour) === bucket) samples.push(0.1)
  if (!samples.length) return prior
  const learned = samples.reduce((a, b) => a + b, 0) / samples.length
  const c = samples.length / (samples.length + 6)
  return clamp((1 - c) * prior + c * (0.25 + 0.75 * learned))
}

export function currentEnergy(input: EngineInput): number {
  return isLowEnergy(input) ? 0.2 : energyAt(input.now.getHours(), input)
}

// ── Factors ──────────────────────────────────────────────────────────────────

/** Handoffs need lead time: the other person has to read, reply or approve. */
export function isHandoff(task: Task): boolean {
  return task.category === 'outreach' && (!!task.person || /\b(send|submit|share|ask|request|propose|pitch|email)\b/i.test(task.title))
}

function activeGoals(goals: Goal[]) {
  return goals.filter((g) => !g.completedAt).sort((a, b) => a.position - b.position)
}

function impactOf(task: Task, input: EngineInput, goalsSorted: Goal[]): number {
  let local = 0.3
  if (/\b(pay|renew|tax|taxes|rent|invoice|deadline|visa|insurance|bill)\b/i.test(task.title)) local = 0.42
  const idx = task.goalId ? goalsSorted.findIndex((g) => g.id === task.goalId) : -1
  if (idx >= 0) {
    const g = goalsSorted[idx]
    local = 0.6 + ([0.2, 0.12, 0.06][idx] ?? 0.03)
    if (g.deadline) {
      const days = hoursUntil(g.deadline + 'T23:59:00', input.now) / 24
      if (days <= 7) local += 0.1
      else if (days <= 30) local += 0.05
    }
    local += input.learning.goalAffinity[g.id] ?? 0
  }
  const ai = input.ai[task.id]
  let impact = ai && Number.isFinite(ai.impact) ? 0.55 * ai.impact + 0.45 * local : local
  impact *= Math.pow(0.55, task.notImportant)
  return clamp(impact)
}

function urgencyOf(task: Task, input: EngineInput): number {
  if (!task.due) return 0.08
  const h = hoursUntil(task.due, input.now)
  if (h < 0) return 1
  const lead = isHandoff(task) ? 24 : 0
  const slackDays = Math.max(0, (h - (task.effort / 60) * 2 - lead) / 24)
  return clamp(Math.exp(-slackDays / 2.2))
}

function fitOf(task: Task, input: EngineInput, avail: number): number {
  if (task.effort <= avail) {
    // When time is short, smaller is better.
    if (isShortOnTime(input)) return clamp(1 - (task.effort / avail) * 0.25)
    return 1
  }
  return clamp((avail / task.effort) * 0.85, 0.12, 0.85)
}

function energyFitOf(task: Task, energy: number): number {
  const d = demand(task.category, task.effort)
  return energy >= d ? clamp(1 - 0.3 * (energy - d)) : clamp(1 - 1.25 * (d - energy))
}

function ratingsOf(task: Task, input: EngineInput): number {
  if (!input.ratings.length) return 0.5
  const kw = keywords(task.title)
  let num = 0
  let den = 0
  for (const r of input.ratings) {
    if (r.taskId === task.id) continue
    const sim = 0.6 * jaccard(kw, r.keywords) + 0.25 * (r.category === task.category ? 1 : 0) + 0.15 * (r.goalId && r.goalId === task.goalId ? 1 : 0)
    if (sim < 0.25) continue
    num += sim * (r.value / 2)
    den += sim
  }
  if (!den) return 0.5
  const conf = Math.min(1, den / 2)
  return clamp(0.5 + (num / den - 0.5) * conf)
}

// ── Ranking ──────────────────────────────────────────────────────────────────

export function rank(input: EngineInput): Ranked[] {
  const now = input.now.getTime()
  const open = input.tasks.filter((t) => t.status === 'open')
  const byId = new Map(input.tasks.map((t) => [t.id, t]))
  const goalsSorted = activeGoals(input.goals)
  const weights = weightsFor(input)
  const avail = availableMinutes(input)
  const energy = currentEnergy(input)
  const today = dayKey(input.now)
  const plannedId = input.plans[today]

  const ranked: Ranked[] = open.map((task) => {
    const waitingOn = task.blockedBy.map((id) => byId.get(id)).filter((t): t is Task => !!t && t.status === 'open')
    const dependents = open.filter((t) => t.blockedBy.includes(task.id))
    const kbMatch = matchKB(task, input.kb)
    const impact = impactOf(task, input, goalsSorted)

    let kb = 0.5
    if (kbMatch?.kind === 'avoid') kb = impact >= 0.45 ? 0.95 : 0.6
    else if (kbMatch?.kind === 'highValue') kb = 0.9
    else if (kbMatch?.kind === 'busywork') kb = 0.1

    const unblock = clamp(1 - Math.pow(0.5, dependents.length) + (dependents.some((d) => d.goalId) ? 0.1 : 0))

    const factors: Record<FactorKey, number> = {
      impact,
      urgency: urgencyOf(task, input),
      unblock,
      fit: fitOf(task, input, avail),
      energy: energyFitOf(task, energy),
      ratings: ratingsOf(task, input),
      kb,
    }

    let score = 0
    for (const k of Object.keys(weights) as FactorKey[]) score += weights[k] * factors[k]
    const planned = plannedId === task.id
    if (planned) score += input.now.getHours() < 14 ? 0.3 : 0.1
    score += task.userBias
    // "Not now" context is decisive: the very next pick must honour it.
    if (isShortOnTime(input) && task.effort > avail) score -= 0.35
    if (isLowEnergy(input) && demand(task.category, task.effort) > 0.55) score -= 0.2

    const snoozed = !!task.snoozedUntil && new Date(task.snoozedUntil).getTime() > now
    const blocked = !!task.blockedUntil && new Date(task.blockedUntil).getTime() > now
    const available = !snoozed && !blocked && waitingOn.length === 0

    return {
      task,
      score,
      factors,
      weights,
      bucket: 'later',
      available,
      waitingOn,
      dependents,
      kbMatch,
      planned,
      hoursToDue: task.due ? hoursUntil(task.due, input.now) : null,
    }
  })

  const isSkip = (r: Ranked) =>
    (r.task.notImportant >= 1 && r.factors.impact < 0.4 && r.factors.urgency < 0.5) ||
    (r.kbMatch?.kind === 'busywork' && r.factors.impact < 0.5 && r.factors.urgency < 0.5 && r.factors.unblock === 0) ||
    (input.ai[r.task.id]?.impact ?? 1) < 0.15

  const sorted = [...ranked].sort((a, b) => b.score - a.score)
  const skip = sorted.filter(isSkip)
  const keep = sorted.filter((r) => !isSkip(r))
  const avail2 = keep.filter((r) => r.available)
  const unavailable = keep.filter((r) => !r.available)

  if (avail2.length) {
    const top = avail2[0]
    top.bucket = 'now'
    let nowCount = 1
    let nextCount = 0
    for (const r of avail2.slice(1)) {
      if (nowCount < 3 && r.score >= top.score - 0.05 && r.factors.urgency >= 0.75) {
        r.bucket = 'now'
        nowCount++
      } else if (nextCount < 4) {
        r.bucket = 'next'
        nextCount++
      } else r.bucket = 'later'
    }
  }
  unavailable.forEach((r) => (r.bucket = 'later'))
  skip.forEach((r) => (r.bucket = 'skip'))

  const order = { now: 0, next: 1, later: 2, skip: 3 }
  return [...avail2, ...unavailable, ...skip].sort((a, b) => order[a.bucket] - order[b.bucket] || (a.available === b.available ? b.score - a.score : a.available ? -1 : 1))
}

export function topPick(ranked: Ranked[]): Ranked | null {
  return ranked.find((r) => r.bucket === 'now') ?? null
}

/** Rank as if it were a fresh morning — for "Tomorrow starts with…" and weekly planning. */
export function rankAt(input: EngineInput, when: Date): Ranked[] {
  return rank({
    ...input,
    now: when,
    session: { shortOnTimeUntil: null, availableMinutes: null, lowEnergyUntil: null },
    plans: {},
  })
}
