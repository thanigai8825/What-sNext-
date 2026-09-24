import * as chrono from 'chrono-node/en'
import { atHour, dayKey } from './time'
import { capitalize, defaultEffort, guessCategory, jaccard, keywords, overlap, similarity, stem } from './text'
import type { Category, Goal } from './types'

export interface ParsedTask {
  /** The line as the user wrote it. */
  raw: string
  title: string
  due: string | null
  dueHasTime: boolean
  dueText: string | null
  effort: number
  effortGuessed: boolean
  goalId: string | null
  goalConfidence: number
  person: string | null
  category: Category
  /** A task this one waits on ("after X"); resolved to an id by the caller. */
  after: string | null
  /** Title that keeps the "after X" phrase, for when it can't be resolved. */
  fullTitle: string
}

interface ParseContext {
  now: Date
  goals: Goal[]
  dayEndHour?: number
}

// ── Effort ───────────────────────────────────────────────────────────────────

const HOUR = '(?:h|hr|hrs|hour|hours)'
const MIN = '(?:m|min|mins|minute|minutes)'

interface Found {
  minutes: number
  start: number
  end: number
}

export function findEffort(text: string): Found | null {
  const patterns: Array<[RegExp, (m: RegExpExecArray) => number]> = [
    // 1h30, 1h 30m, 1 hr 30 min
    [new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${HOUR}\\s*(\\d+)\\s*${MIN}?\\b`, 'i'), (m) => +m[1] * 60 + +m[2]],
    // 2-3 hours → midpoint
    [new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:-|–|to)\\s*(\\d+(?:\\.\\d+)?)\\s*${HOUR}\\b`, 'i'), (m) => ((+m[1] + +m[2]) / 2) * 60],
    [new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:-|–|to)\\s*(\\d+)\\s*${MIN}\\b`, 'i'), (m) => (+m[1] + +m[2]) / 2],
    [new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${HOUR}\\b`, 'i'), (m) => +m[1] * 60],
    [new RegExp(`(\\d+)\\s*${MIN}\\b`, 'i'), (m) => +m[1]],
    [/\bhalf\s+(?:an?\s+)?hour\b/i, () => 30],
    [/\ban\s+hour\b/i, () => 60],
    [/\ba\s+couple\s+(?:of\s+)?hours\b/i, () => 120],
    [/\ball\s+day\b/i, () => 360],
  ]
  for (const [re, toMin] of patterns) {
    const m = re.exec(text)
    if (!m) continue
    let start = m.index
    let end = m.index + m[0].length
    // Swallow a leading qualifier: "~", "about", "takes", "(", "for"
    const before = text.slice(0, start)
    const q = /(?:[~≈(]|\b(?:about|around|approx\.?|approximately|takes?|for|in|roughly))\s*$/i.exec(before)
    if (q) start = q.index
    if (text[end] === ')') end += 1
    const minutes = Math.round(toMin(m))
    if (minutes > 0 && minutes <= 16 * 60) return { minutes, start, end }
  }
  return null
}

// ── Dates ────────────────────────────────────────────────────────────────────

const AMBIGUOUS_DATE_WORDS = new Set(['may', 'march', 'sat', 'sun', 'wed', 'second', 'now', 'mon', 'fri', 'jan', 'june'])

interface FoundDate {
  date: Date
  hasTime: boolean
  start: number
  end: number
  text: string
}

export function findDate(text: string, now: Date, dayEndHour = 18): FoundDate | null {
  // Shorthands chrono doesn't know.
  const eod = /\b(?:by\s+)?(?:eod|end of (?:the )?day)\b/i.exec(text)
  if (eod) {
    return { date: atHour(now, dayEndHour), hasTime: false, start: eod.index, end: eod.index + eod[0].length, text: eod[0] }
  }
  const asap = /\basap\b/i.exec(text)
  if (asap) {
    return { date: atHour(now, dayEndHour), hasTime: false, start: asap.index, end: asap.index + asap[0].length, text: asap[0] }
  }
  const eow = /\b(?:by\s+)?(?:eow|end of (?:the )?week|this week)\b/i.exec(text)
  if (eow) {
    const d = new Date(now)
    const toFri = (5 - d.getDay() + 7) % 7
    d.setDate(d.getDate() + toFri)
    return { date: atHour(d, dayEndHour), hasTime: false, start: eow.index, end: eow.index + eow[0].length, text: eow[0] }
  }
  const eom = /\b(?:by\s+)?(?:eom|end of (?:the )?month|this month)\b/i.exec(text)
  if (eom) {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { date: atHour(d, dayEndHour), hasTime: false, start: eom.index, end: eom.index + eom[0].length, text: eom[0] }
  }

  const results = chrono.parse(text, now, { forwardDate: true })
  for (const r of results) {
    const lower = r.text.toLowerCase().trim()
    if (AMBIGUOUS_DATE_WORDS.has(lower)) {
      // Accept "may"/"sun" only when clearly used as a date: "by May", "on Sun".
      const lead = text.slice(Math.max(0, r.index - 6), r.index).toLowerCase()
      if (!/\b(by|on|due|until|before)\s*$/.test(lead)) continue
    }
    // Relative durations like "in 2 hours" are effort, not deadlines, in a task list.
    if (/^in\s+\d/.test(lower) && /(hour|min)/.test(lower)) continue
    const hasTime = r.start.isCertain('hour')
    let date = r.start.date()
    if (!hasTime) date = atHour(date, dayEndHour)
    let start = r.index
    const lead = /\b(?:by|on|before|due|until|till|for|at|this)\s+$/i.exec(text.slice(0, start))
    if (lead) start = lead.index
    return { date, hasTime, start, end: r.index + r.text.length, text: r.text }
  }
  return null
}

// ── People ───────────────────────────────────────────────────────────────────

const PERSON_LEADS = new Set([
  'to', 'with', 'from', 'for', 'cc', 'ask', 'call', 'email', 'ping', 'text', 'message', 'tell', 'thank', 'remind',
  'meet', 'invite', 'pay', 'dm', 'reply', 'introduce', 'update', 'send', 'follow', 'nudge', 'brief', 'contact',
])
const NOT_NAMES = new Set([
  'I', 'The', 'A', 'An', 'My', 'Our', 'Your', 'This', 'That', 'Q1', 'Q2', 'Q3', 'Q4', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December', 'Today', 'Tomorrow', 'Team', 'Everyone', 'All', 'Slack', 'Notion',
  'Figma', 'Google', 'LinkedIn', 'Twitter', 'GitHub', 'Jira', 'Zoom', 'Gmail', 'Launch', 'Portfolio', 'Website', 'App',
  'Up', 'On', 'Back',
])

export function findPerson(text: string): string | null {
  const tokens = text.split(/\s+/)
  for (let i = 0; i < tokens.length - 1; i++) {
    const lead = tokens[i].toLowerCase().replace(/[^a-z]/g, '')
    if (!PERSON_LEADS.has(lead)) continue
    let j = i + 1
    if (tokens[j]?.toLowerCase() === 'up') j++ // "follow up with Priya"
    if (tokens[j]?.toLowerCase() === 'with' || tokens[j]?.toLowerCase() === 'to') j++
    const cand = (tokens[j] ?? '').replace(/[^A-Za-z'-]/g, '').replace(/'s$/, '')
    if (/^[A-Z][a-z'-]{1,}$/.test(cand) && !NOT_NAMES.has(cand)) return cand
  }
  return null
}

// ── Goals ────────────────────────────────────────────────────────────────────

/** Loose concept groups so "proposal" can find "freelance income". */
const CONCEPTS: string[][] = [
  ['income', 'revenue', 'money', 'business', 'freelance', 'client', 'clients', 'customer', 'proposal', 'invoice', 'pitch', 'lead', 'sale', 'sales', 'deal', 'contract', 'pricing', 'agency', 'consult'],
  ['job', 'career', 'role', 'hire', 'hired', 'resume', 'cv', 'apply', 'application', 'interview', 'recruiter', 'portfolio', 'linkedin', 'offer', 'promotion'],
  ['launch', 'product', 'startup', 'ship', 'release', 'beta', 'user', 'users', 'landing', 'waitlist', 'feature', 'mvp', 'app', 'website', 'site'],
  ['health', 'fitness', 'marathon', 'run', 'running', 'gym', 'workout', 'weight', 'train', 'training', 'sleep', 'diet', 'race'],
  ['book', 'writing', 'write', 'novel', 'chapter', 'draft', 'manuscript', 'essay', 'newsletter', 'blog', 'article', 'publish'],
  ['learn', 'learning', 'course', 'study', 'exam', 'certification', 'degree', 'class', 'skill', 'language', 'practice'],
  ['home', 'house', 'move', 'moving', 'apartment', 'renovation', 'wedding', 'family', 'trip', 'travel'],
  ['fundraise', 'fundraising', 'investor', 'investors', 'pitch', 'deck', 'seed', 'raise', 'vc'],
  ['audience', 'followers', 'content', 'video', 'youtube', 'podcast', 'post', 'posts', 'social', 'community', 'newsletter'],
]
const CONCEPT_STEMS = CONCEPTS.map((g) => g.map(stem))

function expand(kw: string[]): string[] {
  const out = new Set<string>()
  for (const group of CONCEPT_STEMS) if (kw.some((k) => group.includes(k))) group.forEach((g) => out.add(g))
  kw.forEach((k) => out.delete(k))
  return [...out]
}

export function matchGoal(title: string, goals: Goal[], hint?: string | null): { goalId: string | null; confidence: number } {
  const active = goals.filter((g) => !g.completedAt)
  if (!active.length) return { goalId: null, confidence: 0 }
  const tk = keywords(title)
  if (hint) {
    const hk = keywords(hint)
    const hit = active.find((g) => overlap(hk, keywords(g.title)) > 0 || g.title.toLowerCase().startsWith(hint.toLowerCase()))
    if (hit) return { goalId: hit.id, confidence: 1 }
  }
  let best: { goalId: string | null; confidence: number } = { goalId: null, confidence: 0 }
  for (const g of active) {
    const gk = keywords(g.title)
    const direct = Math.max(overlap(gk, tk), jaccard(gk, tk) * 1.2)
    const related = expand(gk)
    const hits = tk.filter((k) => related.includes(k)).length
    const score = Math.max(direct, hits ? Math.min(0.6, 0.4 + 0.1 * (hits - 1)) : 0)
    if (score > best.confidence) best = { goalId: g.id, confidence: score }
  }
  return best.confidence >= 0.3 ? best : { goalId: null, confidence: best.confidence }
}

// ── Lines ────────────────────────────────────────────────────────────────────

function cut(text: string, start: number, end: number) {
  return (text.slice(0, start) + ' ' + text.slice(end)).replace(/\s+/g, ' ')
}

function tidyTitle(text: string): string {
  let t = text
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Drop dangling connectors left behind by extraction.
  for (let i = 0; i < 3; i++) {
    t = t
      .replace(/[\s,;:–—-]+$/g, '')
      .replace(/\s+(?:by|on|at|for|due|before|until|in|and|,)$/i, '')
      .replace(/^[\s,;:–—-]+/, '')
      .trim()
  }
  t = t.replace(/[.]+$/, '')
  return capitalize(t)
}

const BULLET = /^\s*(?:[-*•·–—]|\d+[.)]|\[\s?[xX ]?\s?\]|☐|☑|✓|✔)\s*/

export function parseTaskLine(line: string, ctx: ParseContext): ParsedTask {
  const raw = line.replace(BULLET, '').trim()
  let text = raw
  const dayEnd = ctx.dayEndHour ?? 18

  // Explicit goal hint: "#portfolio"
  let goalHint: string | null = null
  const hashtag = /(?:^|\s)#([\w-]+)/.exec(text)
  if (hashtag) {
    goalHint = hashtag[1].replace(/[-_]/g, ' ')
    text = cut(text, hashtag.index, hashtag.index + hashtag[0].length)
  }

  let effort: number | null = null
  const e = findEffort(text)
  if (e) {
    effort = e.minutes
    text = cut(text, e.start, e.end)
  }
  if (effort === null && /\bquick(?:ly)?\b/i.test(text)) effort = 10

  let due: Date | null = null
  let dueHasTime = false
  let dueText: string | null = null
  const d = findDate(text, ctx.now, dayEnd)
  if (d) {
    due = d.date
    dueHasTime = d.hasTime
    dueText = d.text
    text = cut(text, d.start, d.end)
  }

  let after: string | null = null
  let withoutAfter = text
  const dep = /\b(?:after|once)\s+(.+?)(?:\s+(?:is|are|has been|have been)\s+(?:done|finished|complete|completed|sent|ready|approved|back))?\s*$/i.exec(
    text,
  )
  const waiting = /\b(?:waiting (?:on|for)|blocked by|depends on)\s+(.+)$/i.exec(text)
  const depMatch = waiting ?? dep
  if (depMatch && depMatch.index > 0 && depMatch[1].split(' ').length <= 8) {
    after = depMatch[1].trim()
    withoutAfter = text.slice(0, depMatch.index)
  }

  const person = findPerson(text)
  const fullTitle = tidyTitle(text) || tidyTitle(raw)
  const title = tidyTitle(withoutAfter) || fullTitle
  const category = guessCategory(title)
  const { goalId, confidence } = matchGoal(title, ctx.goals, goalHint)

  return {
    raw,
    title,
    due: due ? due.toISOString() : null,
    dueHasTime,
    dueText,
    effort: effort ?? defaultEffort(category),
    effortGuessed: effort === null,
    goalId,
    goalConfidence: confidence,
    person,
    category,
    after,
    fullTitle,
  }
}

/** Split pasted text into task lines, skipping headers and blanks. */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n|;\s+/)
    .map((l) => l.replace(BULLET, '').trim())
    .filter((l) => l.length > 1)
    .filter((l) => !/^[\w\s&/]{1,24}:$/.test(l)) // "Work:" style headers
}

export function parseTaskList(text: string, ctx: ParseContext): ParsedTask[] {
  return splitLines(text).map((l) => parseTaskLine(l, ctx))
}

/** "Launch portfolio by Oct 30" → title + deadline (YYYY-MM-DD) */
export function parseGoalInput(text: string, now: Date): { title: string; deadline: string | null; dueText: string | null } {
  const d = findDate(text, now)
  if (!d) return { title: tidyTitle(text), deadline: null, dueText: null }
  return { title: tidyTitle(cut(text, d.start, d.end)), deadline: dayKey(d.date), dueText: d.text }
}

/** Resolve "after X" fragments to task ids by title similarity. */
export function resolveAfter(fragment: string, candidates: Array<{ id: string; title: string }>, selfId?: string): string | null {
  let best: { id: string; s: number } | null = null
  for (const c of candidates) {
    if (c.id === selfId) continue
    const s = Math.max(similarity(fragment, c.title), overlap(keywords(fragment), keywords(c.title)) * 0.9)
    if (s >= 0.34 && (!best || s > best.s)) best = { id: c.id, s }
  }
  return best?.id ?? null
}
