import { describe, expect, it } from 'vitest'
import { newGoal, newTask } from '../engine/factory'
import type { KnowledgeBase, Rating, SkipEvent } from '../engine/types'
import { mappers } from './sync'

const uid = '11111111-1111-4111-8111-111111111111'

describe('sync row mapping', () => {
  it('round-trips every entity without loss', () => {
    const g = newGoal('Launch portfolio', '2026-10-30', 0)
    const t = {
      ...newTask({ title: 'Send proposal to Arun', goalId: g.id, due: new Date().toISOString(), effort: 60, category: 'outreach', person: 'Arun' }),
      blockedBy: ['x'],
      locked: ['due' as const],
      focusMs: 1234,
      userBias: 0.1,
    }
    const r: Rating = { id: 'r', taskId: t.id, value: 2, hour: 9, category: 'deep', goalId: g.id, keywords: ['case'], effort: 60, createdAt: new Date().toISOString() }
    const s: SkipEvent = { id: 's', taskId: t.id, reason: 'no_time', hour: 15, category: 'outreach', createdAt: new Date().toISOString() }
    const kb: KnowledgeBase = { raw: 'GOALS: x', fields: [{ key: 'goals', value: 'x', confirmed: true }], signals: { highValue: [], avoid: ['outreach'], busywork: [], peak: [8, 11] }, importedAt: 'a', updatedAt: 'b' }
    expect(mappers.fromGoal(mappers.toGoal(g, uid))).toEqual(g)
    expect(mappers.fromTask(mappers.toTask(t, uid))).toEqual(t)
    expect(mappers.fromRating(mappers.toRating(r, uid))).toEqual(r)
    expect(mappers.fromSkip(mappers.toSkip(s, uid))).toEqual(s)
    expect(mappers.fromKB(mappers.toKB(kb, uid))).toEqual(kb)
  })

  it('treats server timestamp formats as the same content', () => {
    const t = newTask({ title: 'A', due: '2026-09-25T12:30:00.000Z' })
    const local = mappers.toTask(t, uid)
    const server = { ...local, due: '2026-09-25T12:30:00+00:00', created_at: t.createdAt.replace('Z', '+00:00') }
    expect(mappers.sameContent('tasks', server, local)).toBe(true)
    expect(mappers.sameContent('tasks', { ...server, title: 'B' }, local)).toBe(false)
  })
})
