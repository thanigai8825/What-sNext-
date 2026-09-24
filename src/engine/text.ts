import type { Category } from './types'

const STOP = new Set(
  (
    'a an the and or but if to of for in on at by with from into onto up down out over about as is are was were be been ' +
    'this that these those it its my me i we our you your their them his her he she they do did does done doing get got ' +
    'make made some any all more most less very just really also then than so too can could should would will shall may ' +
    'might must need needs new next last first one two three before after once when while until finally quick quickly ' +
    'today tomorrow tonight week weekend monday tuesday wednesday thursday friday saturday sunday asap eod'
  ).split(' '),
)

/** Lowercase, ascii-ish words. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Very light stemmer — enough to match "proposal"/"proposals", "writing"/"write". */
export function stem(w: string): string {
  if (w.length <= 4) return w
  return w
    .replace(/(ies)$/, 'y')
    .replace(/(sses)$/, 'ss')
    .replace(/([^s])s$/, '$1')
    .replace(/(ing|ed)$/, '')
    .replace(/(ation|ment)$/, '')
    .replace(/e$/, '')
}

export function keywords(text: string): string[] {
  const out = new Set<string>()
  for (const w of words(text)) {
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue
    out.add(stem(w))
  }
  return [...out]
}

export function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const sa = new Set(a)
  let inter = 0
  for (const x of new Set(b)) if (sa.has(x)) inter++
  return inter / (sa.size + new Set(b).size - inter)
}

/** Share of `a`'s keywords that appear in `b`. Asymmetric; good for "does this task mention that goal". */
export function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const sb = new Set(b)
  let hit = 0
  for (const x of a) if (sb.has(x)) hit++
  return hit / a.length
}

export function similarity(a: string, b: string): number {
  return jaccard(keywords(a), keywords(b))
}

const CATEGORY_WORDS: Record<Exclude<Category, 'other'>, string[]> = {
  outreach: [
    'send', 'email', 'mail', 'call', 'phone', 'reach', 'follow', 'followup', 'pitch', 'ask', 'message', 'dm', 'text',
    'ping', 'network', 'apply', 'intro', 'introduce', 'invite', 'contact', 'outreach', 'propose', 'proposal', 'share',
    'submit', 'post', 'publish', 'announce', 'reply', 'respond', 'thank', 'linkedin', 'recruiter', 'client', 'customer',
    'lead', 'sale', 'sales', 'investor', 'negotiate', 'request',
  ],
  deep: [
    'write', 'draft', 'design', 'build', 'plan', 'research', 'code', 'prototype', 'analyze', 'analyse', 'create',
    'develop', 'implement', 'outline', 'strategy', 'model', 'refactor', 'architect', 'sketch', 'edit', 'rewrite',
    'finish', 'ship', 'launch', 'portfolio', 'case', 'study', 'essay', 'chapter', 'deck', 'spec', 'proposal', 'story',
    'solve', 'debug', 'fix', 'record', 'film', 'compose', 'prepare', 'review',
  ],
  admin: [
    'pay', 'book', 'schedule', 'file', 'organize', 'organise', 'clean', 'tidy', 'update', 'inbox', 'expense', 'expenses',
    'renew', 'invoice', 'tax', 'taxes', 'bill', 'bills', 'order', 'buy', 'cancel', 'register', 'form', 'forms', 'sort',
    'archive', 'backup', 'install', 'setup', 'reconcile', 'receipt', 'receipts', 'errand', 'groceries', 'laundry',
    'unsubscribe', 'rename', 'move', 'print', 'scan', 'sign',
  ],
  learning: ['read', 'watch', 'learn', 'course', 'lesson', 'tutorial', 'practice', 'podcast', 'book', 'article', 'class'],
  meeting: ['meet', 'meeting', 'sync', 'standup', 'interview', 'coffee', 'lunch', 'workshop', 'demo', 'presentation', '1on1', 'catchup'],
}

const DEFAULT_EFFORT: Record<Category, number> = {
  deep: 90,
  outreach: 20,
  admin: 15,
  learning: 45,
  meeting: 30,
  other: 30,
}

export function guessCategory(title: string): Category {
  const ws = words(title)
  if (!ws.length) return 'other'
  const first = ws[0]
  // The leading verb is the strongest signal.
  for (const [cat, list] of Object.entries(CATEGORY_WORDS) as Array<[Category, string[]]>) {
    if (list.includes(first)) return cat
  }
  const scores: Partial<Record<Category, number>> = {}
  for (const w of ws) {
    for (const [cat, list] of Object.entries(CATEGORY_WORDS) as Array<[Category, string[]]>) {
      if (list.includes(w)) scores[cat] = (scores[cat] ?? 0) + 1
    }
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  return (best?.[0] as Category) ?? 'other'
}

export function defaultEffort(category: Category): number {
  return DEFAULT_EFFORT[category]
}

/** How much focus a task demands, 0–1. */
export function demand(category: Category, effort: number): number {
  const base: Record<Category, number> = {
    deep: 0.85,
    learning: 0.6,
    outreach: 0.55,
    meeting: 0.45,
    other: 0.45,
    admin: 0.2,
  }
  let d = base[category]
  if (effort >= 90) d += 0.1
  if (effort <= 15) d -= 0.15
  return Math.min(1, Math.max(0, d))
}

const IRREGULAR_ING: Record<string, string> = {
  be: 'being', see: 'seeing', go: 'going', do: 'doing', get: 'getting', set: 'setting', run: 'running', put: 'putting',
  plan: 'planning', ship: 'shipping', submit: 'submitting', lie: 'lying', die: 'dying', dm: 'messaging', ping: 'pinging',
  email: 'emailing', text: 'texting', fix: 'fixing', pay: 'paying', buy: 'buying', review: 'reviewing', film: 'filming',
}

/** "send" → "Sending" — for reasons like "Sending this today gives Arun time…" */
export function gerund(verb: string): string {
  const v = verb.toLowerCase()
  let g = IRREGULAR_ING[v]
  if (!g) {
    if (v.endsWith('ie')) g = v.slice(0, -2) + 'ying'
    else if (v.endsWith('ee') || v.endsWith('ye') || v.endsWith('oe')) g = v + 'ing'
    else if (v.endsWith('e') && v.length > 2) g = v.slice(0, -1) + 'ing'
    else g = v + 'ing'
  }
  return g.charAt(0).toUpperCase() + g.slice(1)
}

export function firstWord(title: string): string {
  return (title.trim().split(/\s+/)[0] ?? '').replace(/[^a-zA-Z]/g, '')
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** Keep quotes short in sentences. */
export function shortTitle(title: string, max = 42): string {
  const t = title.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > 20 ? cut.slice(0, sp) : cut).replace(/[,.;:\s]+$/, '') + '…'
}

export function plural(n: number, one: string, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`
}

export function numberWord(n: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n)
}
