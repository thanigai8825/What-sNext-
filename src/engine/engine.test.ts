import { describe, expect, it } from 'vitest'
import { newGoal, newTask } from './factory'
import { parseGoalInput, parseTaskLine, splitLines } from './parse'
import { rank, topPick } from './score'
import { explain, goalProgress } from './explain'
import { deriveSignals, matchKB, parseProfile } from './kb'
import { pickReward } from './rewards'
import type { EngineInput, Rating, Task } from './types'

// Wednesday, 10:00 local
const NOW = new Date(2026, 8, 23, 10, 0, 0)

const goals = [newGoal('Launch portfolio', '2026-10-30', 0, NOW), newGoal('Grow freelance income', null, 1, NOW)]

function input(tasks: Task[], extra: Partial<EngineInput> = {}): EngineInput {
  return {
    now: NOW,
    goals,
    tasks,
    ratings: [],
    skips: [],
    kb: null,
    session: { shortOnTimeUntil: null, availableMinutes: null, lowEnergyUntil: null },
    learning: { goalAffinity: {} },
    plans: {},
    ai: {},
    dayEndHour: 18,
    ...extra,
  }
}

describe('parseTaskLine', () => {
  it('pulls deadline, effort and person out of natural language', () => {
    const p = parseTaskLine('send proposal to Arun by Friday, 1 hr', { now: NOW, goals })
    expect(p.title).toBe('Send proposal to Arun')
    expect(p.effort).toBe(60)
    expect(p.effortGuessed).toBe(false)
    expect(p.person).toBe('Arun')
    expect(p.category).toBe('outreach')
    const due = new Date(p.due!)
    expect(due.getDay()).toBe(5)
    expect(due.getDate()).toBe(25)
    expect(p.goalId).toBe(goals[1].id) // proposal → freelance income
  })

  it('links tasks to goals by meaning', () => {
    const p = parseTaskLine('- Draft case study for portfolio (90 min)', { now: NOW, goals })
    expect(p.title).toBe('Draft case study for portfolio')
    expect(p.effort).toBe(90)
    expect(p.goalId).toBe(goals[0].id)
  })

  it('guesses effort by kind of work when none is given', () => {
    const p = parseTaskLine('Pay electricity bill', { now: NOW, goals })
    expect(p.effortGuessed).toBe(true)
    expect(p.category).toBe('admin')
    expect(p.effort).toBeLessThanOrEqual(15)
  })

  it('handles tomorrow, half an hour, and dependencies', () => {
    const p = parseTaskLine('Publish case study tomorrow, half an hour, after draft case study', { now: NOW, goals })
    expect(p.effort).toBe(30)
    expect(new Date(p.due!).getDate()).toBe(24)
    expect(p.after).toMatch(/draft case study/i)
    expect(p.title).toBe('Publish case study')
  })

  it('does not treat "may" as a month', () => {
    const p = parseTaskLine('Ask Sam if we may reuse the logo', { now: NOW, goals })
    expect(p.due).toBeNull()
    expect(p.person).toBe('Sam')
  })

  it('splits pasted lists and skips headers', () => {
    expect(splitLines('Work:\n- one thing\n\n2. two things\n* three')).toEqual(['one thing', 'two things', 'three'])
  })

  it('parses goal deadlines', () => {
    const g = parseGoalInput('Launch portfolio by Oct 30', NOW)
    expect(g.title).toBe('Launch portfolio')
    expect(g.deadline).toBe('2026-10-30')
  })
})

describe('rank', () => {
  const t = (title: string, extra: Partial<Task> = {}) => {
    const p = parseTaskLine(title, { now: NOW, goals })
    return { ...newTask(p, NOW), ...extra }
  }

  it('prefers goal work over easy busywork', () => {
    const tasks = [t('Clean up inbox 15 min'), t('Draft case study for portfolio 90 min')]
    const top = topPick(rank(input(tasks)))!
    expect(top.task.title).toMatch(/case study/)
  })

  it('puts a deadline handoff first and explains why in one sentence', () => {
    const tasks = [t('Draft case study for portfolio 90 min'), t('send proposal to Arun by Friday, 1 hr')]
    const i = input(tasks)
    const ranked = rank(i)
    const top = topPick(ranked)!
    expect(top.task.person).toBe('Arun')
    const e = explain(top, i)
    expect(e.reason).toBe('Sending this today gives Arun time to approve before your Friday deadline.')
    expect(e.reason.split('. ').length).toBe(1)
  })

  it('rewards unblocking', () => {
    const a = t('Write intro copy 30 min')
    const b = t('Build landing page', { blockedBy: [a.id] })
    const c = t('Record demo video', { blockedBy: [a.id] })
    const ranked = rank(input([t('Organize desktop files'), a, b, c]))
    expect(topPick(ranked)!.task.id).toBe(a.id)
    expect(ranked.find((r) => r.task.id === b.id)!.available).toBe(false)
  })

  it('adapts immediately to "No time" and "Low energy"', () => {
    const deep = t('Draft case study for portfolio 90 min')
    const light = t('Email Priya the invoice 10 min', { goalId: goals[1].id })
    const base = input([deep, light])
    expect(topPick(rank(base))!.task.id).toBe(deep.id)
    const short = input([{ ...deep, snoozedUntil: new Date(NOW.getTime() + 3600_000).toISOString() }, light], {
      session: { shortOnTimeUntil: NOW.getTime() + 3600_000, availableMinutes: 20, lowEnergyUntil: null },
    })
    expect(topPick(rank(short))!.task.id).toBe(light.id)
  })

  it('after "No time", the next pick fits in less time than the skipped one', () => {
    const proposal = t('send proposal to Arun by Friday, 1 hr')
    const later = new Date(NOW.getTime() + 90 * 60_000).toISOString()
    const tasks = [{ ...proposal, snoozedUntil: later }, t('Draft case study for portfolio 90 min'), t('Reach out to 3 past clients')]
    const i = input(tasks, { session: { shortOnTimeUntil: NOW.getTime() + 90 * 60_000, availableMinutes: 30, lowEnergyUntil: null } })
    const top = topPick(rank(i))!
    expect(top.task.effort).toBeLessThanOrEqual(30)
    expect(explain(top, i).reason).toMatch(/fits in the 30 min you have/)
  })

  it('keeps room for unplanned work in goal progress', () => {
    const a = { ...t('Draft case study for portfolio 90 min'), status: 'done' as const }
    expect(goalProgress(goals[0].id, [a])).toBeLessThan(100)
    expect(goalProgress(goals[0].id, [a])).toBeGreaterThan(50)
  })

  it('moves "not important" busywork to probably skip', () => {
    const r = rank(input([t('Reorganize bookmarks', { notImportant: 1 }), t('Draft case study for portfolio')]))
    expect(r.find((x) => x.task.title.startsWith('Reorganize'))!.bucket).toBe('skip')
  })

  it('always leaves exactly one top pick when something is available', () => {
    const r = rank(input([t('a thing'), t('another thing'), t('third thing')]))
    expect(r.filter((x) => x.bucket === 'now').length).toBeGreaterThanOrEqual(1)
    expect(topPick(r)).not.toBeNull()
  })
})

describe('knowledge base', () => {
  const raw = `**GOALS:** Launch my portfolio by October 30
ROLE & PROJECTS: Freelance product designer. Redesigning a fintech app.
HIGH-VALUE WORK: case studies, client proposals
AVOIDANCE PATTERNS: I tend to put off outreach and sales calls; I use inbox cleanup and tweaking my website to feel productive
ENERGY & SCHEDULE: I focus best in the mornings, 8-11am. Gym on Tuesdays.
CONSTRAINTS: unknown
WORKING STYLE: Short sprints with breaks`

  it('parses fields and drops unknowns', () => {
    const f = parseProfile(raw)
    expect(f.map((x) => x.key)).toEqual(['goals', 'role', 'highValue', 'avoidance', 'energy', 'style'])
    expect(f[0].value).toBe('Launch my portfolio by October 30')
  })

  it('derives signals', () => {
    const s = deriveSignals(parseProfile(raw))
    expect(s.avoid).toContain('outreach')
    expect(s.busywork).toContain('inbox cleanup')
    expect(s.peak).toEqual([8, 11])
  })

  it('uses avoidance patterns in the reason', () => {
    const fields = parseProfile(raw)
    const kb = { raw, fields, signals: deriveSignals(fields), importedAt: '', updatedAt: '' }
    const task = { ...newTask(parseTaskLine('Reach out to 3 past clients', { now: NOW, goals }), NOW), goalId: goals[1].id }
    expect(matchKB(task, kb)?.kind).toBe('avoid')
    const i = input([task, newTask(parseTaskLine('Clean up inbox', { now: NOW, goals }), NOW)], { kb })
    const top = topPick(rank(i))!
    expect(top.task.id).toBe(task.id)
    expect(explain(top, i).reason).toBe('You mentioned you tend to put off outreach. This is the one to do first.')
  })
})

describe('rewards', () => {
  it('never repeats the same kind twice in a row', () => {
    const goal = goals[0]
    const a = { ...newTask({ title: 'Draft case study', goalId: goal.id, effort: 60 }, NOW) }
    const b = { ...newTask({ title: 'Publish case study', goalId: goal.id, effort: 30 }, NOW), blockedBy: [a.id] }
    const after = [{ ...a, status: 'done' as const, completedAt: NOW.toISOString() }, b]
    let last: ReturnType<typeof pickReward>['kind'] | null = null
    for (let i = 0; i < 30; i++) {
      const r = pickReward({ task: after[0], before: [a, b], after, goals, ratings: [] as Rating[], now: NOW, last, rand: () => (i * 0.37) % 1 })
      expect(r.kind).not.toBe(last)
      last = r.kind
    }
  })
})
