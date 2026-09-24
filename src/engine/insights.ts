import type { Category, Rating, SkipEvent, Task } from './types'

const CATEGORY_NOUN: Record<Category, string> = {
  outreach: 'Outreach',
  deep: 'Deep work',
  admin: 'Admin',
  learning: 'Learning',
  meeting: 'Meeting prep',
  other: 'Open-ended work',
}

export interface Insight {
  kind: 'timing' | 'avoidance' | 'energy' | 'estimate'
  text: string
  suggestion: string
}

const round1 = (x: number) => Math.round(x * 10) / 10

/** "You finish high-value work 3x more often before noon." Needs enough ratings to be honest. */
export function timingInsight(ratings: Rating[]): string | null {
  const am = ratings.filter((r) => r.hour < 12)
  const pm = ratings.filter((r) => r.hour >= 12)
  if (am.length < 3 || pm.length < 3) return null
  const rate = (rs: Rating[]) => rs.filter((r) => r.value === 2).length / rs.length
  const a = rate(am)
  const p = rate(pm)
  if (a > 0 && p > 0 && a / p >= 1.5) return `You finish high-value work ${round1(a / p)}x more often before noon.`
  if (a > 0 && p > 0 && p / a >= 1.5) return `You finish high-value work ${round1(p / a)}x more often after noon.`
  if (a >= 0.5 && p === 0) return `Your highest-value work happens before noon.`
  if (p >= 0.5 && a === 0) return `Your highest-value work happens after noon.`
  return null
}

/** Value of a finished task, 0–1: what the person said, or our best estimate. */
function valueOf(t: Task, ratings: Rating[]): number {
  const r = ratings.find((x) => x.taskId === t.id)
  if (r) return [0, 0.5, 1][r.value]
  return t.goalId ? 0.75 : 0.25
}

export function minutesOf(t: Task): number {
  return t.focusMs > 60_000 ? t.focusMs / 60_000 : t.effort
}

export interface WeekSummary {
  highValueShare: number
  doneCount: number
  minutes: number
  insights: Insight[]
  suggestion: string
}

export function summarizeWeek(tasks: Task[], ratings: Rating[], skips: SkipEvent[], now: Date): WeekSummary {
  const since = now.getTime() - 7 * 86_400_000
  const done = tasks.filter((t) => t.status === 'done' && t.completedAt && new Date(t.completedAt).getTime() >= since)
  const minutes = done.reduce((s, t) => s + minutesOf(t), 0)
  const hv = done.reduce((s, t) => s + minutesOf(t) * valueOf(t, ratings), 0)
  const highValueShare = minutes ? Math.round((hv / minutes) * 100) : 0

  const insights: Insight[] = []

  const timing = timingInsight(ratings)
  if (timing) {
    insights.push({
      kind: 'timing',
      text: timing,
      suggestion: timing.includes('before noon') ? 'Protect your mornings for the one task that matters.' : 'Save your afternoons for the work that matters most.',
    })
  }

  // Avoidance: the kind of work that waits longest, or gets "Not now" most.
  const allDone = tasks.filter((t) => t.status === 'done' && t.completedAt)
  const ageDays = (t: Task) => (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / 86_400_000
  const overall = allDone.length ? allDone.reduce((s, t) => s + ageDays(t), 0) / allDone.length : 0
  const byCat = new Map<Category, number[]>()
  for (const t of allDone) byCat.set(t.category, [...(byCat.get(t.category) ?? []), ageDays(t)])
  let slowest: { cat: Category; avg: number } | null = null
  for (const [cat, ages] of byCat) {
    if (ages.length < 2) continue
    const avg = ages.reduce((a, b) => a + b, 0) / ages.length
    if (avg >= 1 && avg >= overall * 1.4 && (!slowest || avg > slowest.avg)) slowest = { cat, avg }
  }
  const recentSkips = skips.filter((s) => new Date(s.createdAt).getTime() >= since && s.reason !== 'blocked')
  const skipCats = new Map<Category, number>()
  for (const s of recentSkips) skipCats.set(s.category, (skipCats.get(s.category) ?? 0) + 1)
  const mostSkipped = [...skipCats.entries()].sort((a, b) => b[1] - a[1])[0]
  if (slowest) {
    insights.push({
      kind: 'avoidance',
      text: `${CATEGORY_NOUN[slowest.cat]} waits ${round1(slowest.avg)} days on average before you finish it.`,
      suggestion: `Start Monday with ${CATEGORY_NOUN[slowest.cat].toLowerCase()}, before it has a chance to wait.`,
    })
  } else if (mostSkipped && mostSkipped[1] >= 3) {
    insights.push({
      kind: 'avoidance',
      text: `${CATEGORY_NOUN[mostSkipped[0]]} got “Not now” ${mostSkipped[1]} times this week.`,
      suggestion: `Start Monday with ${CATEGORY_NOUN[mostSkipped[0]].toLowerCase()}, before it has a chance to wait.`,
    })
  }

  const lowE = skips.filter((s) => s.reason === 'low_energy' && new Date(s.createdAt).getTime() >= since)
  if (lowE.length >= 2) {
    const late = lowE.filter((s) => s.hour >= 14).length / lowE.length
    const early = lowE.filter((s) => s.hour < 11).length / lowE.length
    if (late >= 0.6) {
      insights.push({
        kind: 'energy',
        text: 'Your low-energy moments cluster after 2pm.',
        suggestion: 'Keep afternoons for lighter work, and do the heavy lifting earlier.',
      })
    } else if (early >= 0.6) {
      insights.push({
        kind: 'energy',
        text: 'Your low-energy moments tend to come early in the day.',
        suggestion: 'Ease into mornings with something light, then go deep.',
      })
    }
  }

  const timed = done.filter((t) => t.focusMs > 60_000 && !t.effortGuessed)
  if (timed.length >= 3) {
    const ratio = timed.reduce((s, t) => s + t.focusMs / 60_000 / t.effort, 0) / timed.length
    if (ratio >= 1.25) {
      insights.push({
        kind: 'estimate',
        text: `Tasks take you about ${Math.round((ratio - 1) * 100)}% longer than you plan.`,
        suggestion: 'Plan a little more room per task next week.',
      })
    } else if (ratio <= 0.8) {
      insights.push({
        kind: 'estimate',
        text: `You usually finish ${Math.round((1 - ratio) * 100)}% faster than you plan.`,
        suggestion: 'You have more room than you think. Take on one bigger step.',
      })
    }
  }

  return {
    highValueShare,
    doneCount: done.length,
    minutes,
    insights: insights.slice(0, 3),
    suggestion: insights[0]?.suggestion ?? 'Choose next week’s first task tonight, so Monday starts itself.',
  }
}

const BUCKETS: Array<{ name: string; from: number; to: number }> = [
  { name: 'morning', from: 5, to: 12 },
  { name: 'midday', from: 12, to: 15 },
  { name: 'afternoon', from: 15, to: 18 },
  { name: 'evening', from: 18, to: 24 },
]

/** When the person's best-rated work actually happens, once there's enough to say. */
export function observedPeak(ratings: Rating[]): string | null {
  if (ratings.length < 6) return null
  let best: { name: string; score: number; n: number } | null = null
  for (const b of BUCKETS) {
    const rs = ratings.filter((r) => r.hour >= b.from && r.hour < b.to)
    if (rs.length < 3) continue
    const score = rs.reduce((s, r) => s + r.value, 0) / rs.length
    if (!best || score > best.score) best = { name: b.name, score, n: rs.length }
  }
  return best && best.score >= 1.2 ? best.name : null
}

export function peakName(peak: [number, number] | null): string | null {
  if (!peak) return null
  const mid = (peak[0] + peak[1]) / 2
  return BUCKETS.find((b) => mid >= b.from && mid < b.to)?.name ?? null
}
