import { availableMinutes, currentEnergy, isHandoff, isLowEnergy, isShortOnTime, NEUTRAL } from './score'
import { daysBetween, dueWords, effortLabel, weekdayName } from './time'
import { capitalize, demand, firstWord, gerund, numberWord, shortTitle } from './text'
import type { EngineInput, FactorKey, Goal, Ranked, Task } from './types'

export interface Explanation {
  reason: string
  ifNow: string
  ifDelay: string
  progress: { goal: Goal; before: number; after: number } | null
  source: 'ai' | 'local'
  /** True when the model hasn't judged this task yet and its words would be used. */
  aiPending: boolean
}

/**
 * Share of a goal's work that's done, by effort. Goals always hold more work
 * than anyone has written down, so we keep honest room for the unplanned part:
 * finishing every listed task gets you close, and only you can call it achieved.
 */
export function goalProgress(goalId: string, tasks: Task[], plus?: Task): number {
  const linked = tasks.filter((t) => t.goalId === goalId)
  const total = linked.reduce((s, t) => s + Math.max(5, t.effort), 0)
  if (!total) return 0
  const unplanned = Math.max(60, total * 0.25)
  let done = linked.filter((t) => t.status === 'done').reduce((s, t) => s + Math.max(5, t.effort), 0)
  if (plus && plus.goalId === goalId && plus.status !== 'done') done += Math.max(5, plus.effort)
  return Math.min(99, Math.round((done / (total + unplanned)) * 100))
}

/** True when every task linked to the goal is finished. */
export function allStepsDone(goalId: string, tasks: Task[]): boolean {
  const linked = tasks.filter((t) => t.goalId === goalId)
  return linked.length > 0 && linked.every((t) => t.status === 'done')
}

/** Short, human name for a goal inside a sentence. */
export function goalName(goal: Goal) {
  return shortTitle(goal.title, 32)
}

function drivers(r: Ranked): FactorKey[] {
  return (Object.keys(r.factors) as FactorKey[])
    .map((k) => ({ k, c: r.weights[k] * (r.factors[k] - NEUTRAL[k]) }))
    .filter((x) => x.c > 0.005)
    .sort((a, b) => b.c - a.c)
    .map((x) => x.k)
}

function approveWord(task: Task) {
  return /\b(proposal|contract|quote|estimate|budget|design|draft|deck|plan|spec)\b/i.test(task.title) ? 'approve' : 'reply'
}

/** "the end of the day" · "tomorrow's deadline" · "your Friday deadline" · "your Oct 3 deadline" */
function deadlinePhrase(due: string) {
  if (due === 'today') return 'the end of the day'
  if (due === 'tomorrow') return 'tomorrow’s deadline'
  return `your ${due} deadline`
}

function daysAhead(iso: string, now: Date) {
  const d = daysBetween(now, new Date(iso))
  return d <= 0 ? null : d === 1 ? 'a day' : `${numberWord(d)} days`
}

export function explain(r: Ranked, input: EngineInput): Explanation {
  const { task } = r
  const now = input.now
  const goal = task.goalId ? input.goals.find((g) => g.id === task.goalId) ?? null : null
  const due = task.due ? dueWords(task.due, now) : null
  const verb = firstWord(task.title)
  const ing = verb ? gerund(verb) : 'Doing'
  const handoff = isHandoff(task) && task.due && r.hoursToDue !== null && r.hoursToDue > 0
  const d = drivers(r)

  // ── Reason: one sentence, built around the most compelling real driver ─────
  // Order matters: context the person just gave us, then time pressure, then
  // what they told us about themselves, then structure, then value.
  const lowE = isLowEnergy(input)
  const shortT = isShortOnTime(input)
  const hours = r.hoursToDue
  const dueSoon = hours !== null && hours >= 0 && due !== null && (due === 'today' || due === 'tomorrow')
  const goalSentence = () => {
    if (!goal) return ''
    const gd = goal.deadline ? dueWords(goal.deadline + 'T12:00:00', now) : null
    const idx = input.goals
      .filter((g) => !g.completedAt)
      .sort((a, b) => a.position - b.position)
      .findIndex((g) => g.id === goal.id)
    if (gd && daysBetween(now, new Date(goal.deadline + 'T12:00:00')) <= 14) return `“${goalName(goal)}” is due ${gd}, and this moves it more than anything else here.`
    if (idx === 0) return `This is the most direct step toward “${goalName(goal)}”.`
    return `It moves “${goalName(goal)}” forward more than anything else on your list.`
  }

  let reason = ''
  if (r.planned) {
    reason = 'You picked this last night as the way to start today.'
  } else if (lowE && demand(task.category, task.effort) <= 0.5) {
    reason = `Energy's low, so here's something lighter that still counts.`
  } else if (shortT && task.effort <= availableMinutes(input)) {
    reason = `It fits in the ${effortLabel(availableMinutes(input))} you have, and it still moves things.`
  } else if (hours !== null && hours < 0) {
    reason = `This carried over from ${weekdayName(new Date(task.due!))}, and ${effortLabel(task.effort)} now takes it off your mind.`
  } else if (handoff && hours! <= 24 * 4) {
    reason = task.person
      ? `${ing} this ${due === 'today' ? 'now' : 'today'} gives ${task.person} time to ${approveWord(task)} before ${deadlinePhrase(due!)}.`
      : `${ing} this today leaves room for a reply before ${due}.`
  } else if (dueSoon) {
    reason =
      due === 'today'
        ? `It's due today and takes about ${effortLabel(task.effort)}, so now is the calm window.`
        : `It's due tomorrow, so doing it now keeps tomorrow open.`
  } else if (r.kbMatch?.kind === 'avoid' && r.factors.impact >= 0.45) {
    reason = `You mentioned you tend to put off ${r.kbMatch.phrase}. This is the one to do first.`
  } else if (r.dependents.length) {
    reason =
      r.dependents.length === 1
        ? `“${shortTitle(r.dependents[0].title, 36)}” can't start until this is done.`
        : `${capitalize(numberWord(r.dependents.length))} other tasks are waiting on this, so finishing it clears the way.`
  } else {
    for (const k of d) {
      if (k === 'impact' && goal) reason = goalSentence()
      else if (k === 'kb' && r.kbMatch?.kind === 'highValue') reason = `This is the kind of work you said actually moves your goals forward.`
      else if (k === 'ratings') reason = `Work like this has moved things a lot for you before.`
      else if (k === 'urgency' && due) reason = `It's due ${due}, and starting now keeps it from getting tight.`
      else if (k === 'energy') {
        reason =
          currentEnergy(input) >= 0.75 && demand(task.category, task.effort) >= 0.6
            ? `Your focus is usually sharpest around now, a good window for deep work.`
            : `It suits your energy at this time of day.`
      } else if (k === 'fit') reason = `It fits cleanly into the time you have left today.`
      if (reason) break
    }
  }
  if (!reason) reason = goal ? `It's the clearest next step toward “${goalName(goal)}”.` : `It's the clearest next step on your list.`

  // ── Outcomes ──────────────────────────────────────────────────────────────
  const before = goal ? goalProgress(goal.id, input.tasks) : 0
  const after = goal ? goalProgress(goal.id, input.tasks, task) : 0
  const progress = goal && after > before ? { goal, before, after } : null

  let ifNow = ''
  if (handoff && task.person) ifNow = `${task.person} has it today, with time to spare before ${due}.`
  else if (r.dependents.length === 1) ifNow = `“${shortTitle(r.dependents[0].title, 36)}” can start right after.`
  else if (r.dependents.length > 1) ifNow = `${capitalize(numberWord(r.dependents.length))} waiting tasks open up right after.`
  else if (task.due && r.hoursToDue !== null && r.hoursToDue >= 0 && daysAhead(task.due, now)) ifNow = `It's done ${daysAhead(task.due, now)} ahead of ${due}, with room for changes.`
  else if (r.kbMatch?.kind === 'avoid') ifNow = `One less thing you usually put off, and a lighter head for the rest of the day.`
  else if (progress) ifNow = `“${goalName(goal!)}” moves to ${after}%.`
  else if (task.due && r.hoursToDue !== null && r.hoursToDue < 0) ifNow = `It's off your mind for good.`
  else ifNow = `One real step forward today, not just motion.`

  let ifDelay = ''
  if (handoff && task.person) ifDelay = `${task.person} gets less time to ${approveWord(task)}, and ${due} gets tight.`
  else if (task.due && r.hoursToDue !== null && r.hoursToDue < 0) ifDelay = `It keeps sitting in the back of your mind.`
  else if (due === 'today') ifDelay = `It gets squeezed into the end of the day.`
  else if (due === 'tomorrow') ifDelay = `It lands on tomorrow with no room for changes.`
  else if (r.dependents.length) ifDelay = `${r.dependents.length === 1 ? `“${shortTitle(r.dependents[0].title, 36)}” stays` : `${capitalize(numberWord(r.dependents.length))} tasks stay`} stuck behind it.`
  else if (task.due && r.hoursToDue !== null && r.hoursToDue < 24 * 7) ifDelay = `It drifts closer to ${due} with less room for surprises.`
  else if (r.kbMatch?.kind === 'avoid') ifDelay = `Tasks like this tend to slip once they wait.`
  else if (goal) ifDelay = `“${goalName(goal)}” waits another day.`
  else ifDelay = `Nothing breaks, but nothing moves either.`

  // AI copy wins when it's about this exact version of the task and no
  // short-lived context (low energy, no time, a plan) is shaping the pick.
  const ai = input.ai[task.id]
  const contextual = r.planned || lowE || shortT
  if (ai && ai.reason && !contextual) {
    return { reason: ai.reason, ifNow: ai.now || ifNow, ifDelay: ai.delay || ifDelay, progress, source: 'ai', aiPending: false }
  }
  return { reason, ifNow, ifDelay, progress, source: 'local', aiPending: !ai && !contextual }
}

/** Why a task sits in its bucket — shown in the task detail sheet. */
export function whyBucket(r: Ranked, input: EngineInput): { label: string; text: string } {
  const goal = r.task.goalId ? input.goals.find((g) => g.id === r.task.goalId) : null
  const now = input.now.getTime()
  if (r.bucket === 'now' || r.bucket === 'next') {
    return { label: r.bucket === 'now' ? 'Why it’s first' : 'Why it’s next', text: explain(r, input).reason }
  }
  if (r.bucket === 'skip') {
    if (r.task.notImportant) return { label: 'Why it might not matter', text: 'You said it isn’t important. It stays here in case that changes.' }
    if (r.kbMatch?.kind === 'busywork') return { label: 'Why it might not matter', text: `It looks like the busywork you mentioned (${r.kbMatch.phrase}). It can wait, or go.` }
    return { label: 'Why it might not matter', text: input.ai[r.task.id]?.reason || 'It doesn’t move any of your goals, and nothing depends on it.' }
  }
  if (r.waitingOn.length) return { label: 'Why it can wait', text: `It’s waiting on “${shortTitle(r.waitingOn[0].title, 40)}”.` }
  if (r.task.blockedUntil && new Date(r.task.blockedUntil).getTime() > now) return { label: 'Why it can wait', text: 'You marked it as blocked. It comes back tomorrow morning.' }
  if (r.task.snoozedUntil && new Date(r.task.snoozedUntil).getTime() > now) return { label: 'Why it can wait', text: 'You said not now. It comes back in a little while.' }
  if (goal) return { label: 'Why it can wait', text: `It helps “${goalName(goal)}”, but other steps matter more right now.` }
  if (!r.task.due) return { label: 'Why it can wait', text: 'No deadline, and other tasks move your goals more.' }
  return { label: 'Why it can wait', text: `It’s due ${dueWords(r.task.due, input.now)}, with time to spare.` }
}
