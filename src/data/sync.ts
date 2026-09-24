import type { SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import type { Goal, KnowledgeBase, Rating, SkipEvent, Task } from '../engine/types'
import { useApp, type Data } from '../store/app'
import { getSupabase, supabaseConfigured } from './supabase'

/**
 * Local-first sync. The device is the source of truth for the UI; Supabase
 * mirrors it so the same list follows you across devices. Every write is a
 * diff against what the server last confirmed, so undo and offline edits
 * simply become the next diff.
 */

export type SyncState = 'off' | 'connecting' | 'guest' | 'account' | 'error'

export const useSync = create<{ state: SyncState; email: string | null }>()(() => ({ state: supabaseConfigured ? 'connecting' : 'off', email: null }))

type Row = Record<string, unknown>
type Table = 'goals' | 'tasks' | 'task_ratings' | 'skip_reasons' | 'knowledge_base' | 'users'

const toGoal = (g: Goal, uid: string): Row => ({
  id: g.id,
  user_id: uid,
  title: g.title,
  deadline: g.deadline,
  position: g.position,
  completed_at: g.completedAt,
  created_at: g.createdAt,
  updated_at: g.updatedAt,
})
const fromGoal = (r: Row): Goal => ({
  id: r.id as string,
  title: r.title as string,
  deadline: (r.deadline as string) ?? null,
  position: (r.position as number) ?? 0,
  completedAt: (r.completed_at as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
})

const toTask = (t: Task, uid: string): Row => ({
  id: t.id,
  user_id: uid,
  title: t.title,
  notes: t.notes,
  goal_id: t.goalId,
  due: t.due,
  due_has_time: t.dueHasTime,
  effort_minutes: t.effort,
  effort_guessed: t.effortGuessed,
  category: t.category,
  person: t.person,
  status: t.status,
  blocked_by: t.blockedBy,
  blocked_until: t.blockedUntil,
  snoozed_until: t.snoozedUntil,
  user_bias: t.userBias,
  not_important: t.notImportant,
  focus_ms: Math.round(t.focusMs),
  locked: t.locked,
  created_at: t.createdAt,
  updated_at: t.updatedAt,
  completed_at: t.completedAt,
})
const fromTask = (r: Row): Task => ({
  id: r.id as string,
  title: r.title as string,
  notes: (r.notes as string) ?? '',
  goalId: (r.goal_id as string) ?? null,
  due: (r.due as string) ?? null,
  dueHasTime: !!r.due_has_time,
  effort: (r.effort_minutes as number) ?? 30,
  effortGuessed: !!r.effort_guessed,
  category: (r.category as Task['category']) ?? 'other',
  person: (r.person as string) ?? null,
  status: (r.status as Task['status']) ?? 'open',
  blockedBy: (r.blocked_by as string[]) ?? [],
  blockedUntil: (r.blocked_until as string) ?? null,
  snoozedUntil: (r.snoozed_until as string) ?? null,
  userBias: (r.user_bias as number) ?? 0,
  notImportant: (r.not_important as number) ?? 0,
  focusMs: Number(r.focus_ms ?? 0),
  locked: (r.locked as Task['locked']) ?? [],
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
  completedAt: (r.completed_at as string) ?? null,
})

const toRating = (x: Rating, uid: string): Row => ({
  id: x.id,
  user_id: uid,
  task_id: x.taskId,
  value: x.value,
  hour: x.hour,
  category: x.category,
  goal_id: x.goalId,
  keywords: x.keywords,
  effort_minutes: x.effort,
  created_at: x.createdAt,
})
const fromRating = (r: Row): Rating => ({
  id: r.id as string,
  taskId: r.task_id as string,
  value: r.value as Rating['value'],
  hour: r.hour as number,
  category: r.category as Rating['category'],
  goalId: (r.goal_id as string) ?? null,
  keywords: (r.keywords as string[]) ?? [],
  effort: (r.effort_minutes as number) ?? 30,
  createdAt: r.created_at as string,
})

const toSkip = (x: SkipEvent, uid: string): Row => ({
  id: x.id,
  user_id: uid,
  task_id: x.taskId,
  reason: x.reason,
  hour: x.hour,
  category: x.category,
  created_at: x.createdAt,
})
const fromSkip = (r: Row): SkipEvent => ({
  id: r.id as string,
  taskId: r.task_id as string,
  reason: r.reason as SkipEvent['reason'],
  hour: r.hour as number,
  category: r.category as SkipEvent['category'],
  createdAt: r.created_at as string,
})

const toKB = (k: KnowledgeBase, uid: string): Row => ({
  user_id: uid,
  raw: k.raw,
  fields: k.fields,
  signals: k.signals,
  imported_at: k.importedAt,
  updated_at: k.updatedAt,
})
const fromKB = (r: Row): KnowledgeBase => ({
  raw: (r.raw as string) ?? '',
  fields: (r.fields as KnowledgeBase['fields']) ?? [],
  signals: (r.signals as KnowledgeBase['signals']) ?? { highValue: [], avoid: [], busywork: [], peak: null },
  importedAt: r.imported_at as string,
  updatedAt: r.updated_at as string,
})

const toUser = (s: Data, uid: string): Row => ({
  id: uid,
  name: s.settings.name || null,
  profile: { onboarded: s.onboarded, settings: s.settings, meta: s.meta, plans: s.plans, learning: s.learning },
  updated_at: new Date().toISOString(),
})

function rowsOf(s: Data, uid: string): Record<Table, Row[]> {
  return {
    users: [toUser(s, uid)],
    goals: s.goals.map((g) => toGoal(g, uid)),
    tasks: s.tasks.map((t) => toTask(t, uid)),
    task_ratings: s.ratings.map((r) => toRating(r, uid)),
    skip_reasons: s.skips.map((x) => toSkip(x, uid)),
    knowledge_base: s.kb ? [toKB(s.kb, uid)] : [],
  }
}

const keyOf = (table: Table, r: Row) => (table === 'knowledge_base' ? (r.user_id as string) : (r.id as string))
const stable = (r: Row) => JSON.stringify(r, Object.keys(r).sort())

/** What the server last confirmed, per table: id → serialized row. */
let confirmed: Record<Table, Map<string, string>> | null = null
let pushTimer: number | undefined
let pushing = false

async function push(sb: SupabaseClient, uid: string) {
  if (!confirmed || pushing) return
  pushing = true
  try {
    const rows = rowsOf(useApp.getState(), uid)
    // Parents before children so foreign keys hold.
    for (const table of ['users', 'goals', 'tasks', 'task_ratings', 'skip_reasons', 'knowledge_base'] as Table[]) {
      const seen = new Set<string>()
      const changed: Row[] = []
      for (const r of rows[table]) {
        const k = keyOf(table, r)
        seen.add(k)
        if (table === 'users') {
          // The profile row changes constantly (last active time); compare without it.
          const { updated_at: _u, ...rest } = r
          void _u
          if (confirmed[table].get(k) !== stable(rest)) changed.push(r)
        } else if (confirmed[table].get(k) !== stable(r)) changed.push(r)
      }
      if (changed.length) {
        const { error } = await sb.from(table).upsert(changed, { onConflict: table === 'knowledge_base' ? 'user_id' : 'id' })
        if (error) throw error
        for (const r of changed) {
          if (table === 'users') {
            const { updated_at: _u, ...rest } = r
            void _u
            confirmed[table].set(keyOf(table, r), stable(rest))
          } else confirmed[table].set(keyOf(table, r), stable(r))
        }
      }
      const gone = [...confirmed[table].keys()].filter((k) => !seen.has(k))
      if (gone.length && table !== 'users') {
        const col = table === 'knowledge_base' ? 'user_id' : 'id'
        const { error } = await sb.from(table).delete().in(col, gone)
        if (error) throw error
        gone.forEach((k) => confirmed![table].delete(k))
      }
    }
    if (useSync.getState().state === 'error') useSync.setState({ state: sb ? currentKind : 'off' })
  } catch (e) {
    console.warn('[sync] push failed', e)
    useSync.setState({ state: 'error' })
  } finally {
    pushing = false
  }
}

let currentKind: SyncState = 'guest'

function newer<T extends { id: string; updatedAt: string }>(local: T[], remote: T[]): T[] {
  const map = new Map(local.map((x) => [x.id, x]))
  for (const r of remote) {
    const l = map.get(r.id)
    if (!l || r.updatedAt > l.updatedAt) map.set(r.id, r)
  }
  return [...map.values()]
}

function union<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const map = new Map(local.map((x) => [x.id, x]))
  for (const r of remote) if (!map.has(r.id)) map.set(r.id, r)
  return [...map.values()]
}

async function pull(sb: SupabaseClient, uid: string) {
  const [users, goals, tasks, ratings, skips, kb] = await Promise.all([
    sb.from('users').select('*').eq('id', uid).maybeSingle(),
    sb.from('goals').select('*'),
    sb.from('tasks').select('*'),
    sb.from('task_ratings').select('*'),
    sb.from('skip_reasons').select('*'),
    sb.from('knowledge_base').select('*').maybeSingle(),
  ])
  const err = users.error ?? goals.error ?? tasks.error ?? ratings.error ?? skips.error ?? kb.error
  if (err) throw err

  const remote = {
    goals: (goals.data ?? []).map(fromGoal),
    tasks: (tasks.data ?? []).map(fromTask),
    ratings: (ratings.data ?? []).map(fromRating),
    skips: (skips.data ?? []).map(fromSkip),
    kb: kb.data ? fromKB(kb.data) : null,
    profile: (users.data?.profile ?? null) as Partial<Pick<Data, 'onboarded' | 'settings' | 'meta' | 'plans' | 'learning'>> | null,
  }

  const local = useApp.getState()
  const freshDevice = !local.onboarded && remote.profile?.onboarded
  useApp.setState({
    goals: freshDevice ? remote.goals : newer(local.goals, remote.goals),
    tasks: freshDevice ? remote.tasks : newer(local.tasks, remote.tasks),
    ratings: union(local.ratings, remote.ratings),
    skips: union(local.skips, remote.skips),
    kb: !remote.kb ? local.kb : !local.kb || remote.kb.updatedAt > local.kb.updatedAt ? remote.kb : local.kb,
    ...(freshDevice && remote.profile
      ? {
          onboarded: true,
          settings: { ...local.settings, ...remote.profile.settings },
          plans: remote.profile.plans ?? {},
          learning: remote.profile.learning ?? local.learning,
          meta: { ...local.meta, ...remote.profile.meta },
          currentId: null,
        }
      : {}),
  })

  // Confirmed = exactly what the server holds, so local-only changes push next.
  const serverRows: Record<Table, Row[]> = {
    users: users.data ? [users.data] : [],
    goals: goals.data ?? [],
    tasks: tasks.data ?? [],
    task_ratings: ratings.data ?? [],
    skip_reasons: skips.data ?? [],
    knowledge_base: kb.data ? [kb.data] : [],
  }
  const s = useApp.getState()
  const shaped = rowsOf(s, uid)
  confirmed = {} as Record<Table, Map<string, string>>
  for (const table of Object.keys(serverRows) as Table[]) {
    confirmed[table] = new Map()
    const localShape = new Map(shaped[table].map((r) => [keyOf(table, r), r]))
    for (const r of serverRows[table]) {
      const k = keyOf(table, r)
      // Normalise the server row through our own mapping so formats compare equal.
      const mine = localShape.get(k)
      const same = mine && table !== 'users' && sameContent(table, r, mine)
      confirmed[table].set(k, same ? stable(mine!) : 'server:' + stable(r))
    }
  }
}

function sameContent(table: Table, server: Row, local: Row): boolean {
  const norm = (r: Row) => {
    switch (table) {
      case 'goals':
        return stable(toGoal(fromGoal(r), r.user_id as string))
      case 'tasks':
        return stable(toTask(fromTask(r), r.user_id as string))
      case 'task_ratings':
        return stable(toRating(fromRating(r), r.user_id as string))
      case 'skip_reasons':
        return stable(toSkip(fromSkip(r), r.user_id as string))
      case 'knowledge_base':
        return stable(toKB(fromKB(r), r.user_id as string))
      default:
        return stable(r)
    }
  }
  const time = (s: string) => s.replace(/"(\d{4}-\d{2}-\d{2}T[^"]+)"/g, (_, t) => `"${new Date(t).toISOString()}"`)
  return time(norm(server)) === time(norm(local))
}

let started = false

export async function startSync() {
  if (started) return
  started = true
  const sb = await getSupabase()
  if (!sb) return
  try {
    let { data } = await sb.auth.getSession()
    if (!data.session) {
      const res = await sb.auth.signInAnonymously()
      if (res.error) throw res.error
      data = { session: res.data.session }
    }
    const user = data.session?.user
    if (!user) throw new Error('No session')
    currentKind = user.is_anonymous ? 'guest' : 'account'
    useSync.setState({ state: currentKind, email: user.email ?? null })
    await pull(sb, user.id)
    let uid = user.id
    useApp.subscribe(() => {
      window.clearTimeout(pushTimer)
      pushTimer = window.setTimeout(() => void push(sb, uid), 900)
    })
    void push(sb, uid)
    sb.auth.onAuthStateChange((_event, session) => {
      const u = session?.user
      if (!u) return
      currentKind = u.is_anonymous ? 'guest' : 'account'
      useSync.setState({ state: currentKind, email: u.email ?? null })
      if (u.id !== uid) {
        uid = u.id
        void pull(sb, uid).then(() => push(sb, uid))
      }
    })
  } catch (e) {
    console.warn('[sync] unavailable', e)
    useSync.setState({ state: 'error' })
  }
}

/** Keep this device's data and attach it to an email, so it follows you everywhere. */
export async function linkEmail(email: string): Promise<{ ok: boolean; message: string }> {
  const sb = await getSupabase()
  if (!sb) return { ok: false, message: 'Sync isn’t set up for this app.' }
  const { data } = await sb.auth.getSession()
  const redirect = window.location.origin
  const res = data.session?.user.is_anonymous
    ? await sb.auth.updateUser({ email }, { emailRedirectTo: redirect })
    : await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } })
  if (res.error) return { ok: false, message: res.error.message }
  return { ok: true, message: `Check ${email} for a link to finish.` }
}

export async function signOut() {
  const sb = await getSupabase()
  await sb?.auth.signOut()
  useSync.setState({ state: 'off', email: null })
}
