import { matchGoal, parseGoalInput } from './parse'
import { capitalize, guessCategory, keywords, overlap } from './text'
import type { Goal, KBField, KBFieldKey, KBMatch, KBSignals, KnowledgeBase, Task } from './types'

/** Order here is the order everywhere: prompt, parsing, settings. */
export const KB_FIELDS: Array<{ key: KBFieldKey; label: string; header: string }> = [
  { key: 'goals', label: 'Goals', header: 'GOALS' },
  { key: 'nextSteps', label: 'Next steps', header: 'NEXT STEPS' },
  { key: 'highValue', label: 'Work that moves you forward', header: 'HIGH-VALUE WORK' },
  { key: 'avoidance', label: 'Things you put off', header: 'I PUT OFF' },
  { key: 'busywork', label: 'Busywork', header: 'BUSYWORK' },
  { key: 'energy', label: 'Focus time', header: 'FOCUS TIME' },
  { key: 'constraints', label: 'Limits', header: 'LIMITS' },
  { key: 'role', label: 'About you', header: 'ABOUT ME' },
  { key: 'style', label: 'How you like to work', header: 'WORKING STYLE' },
]

/**
 * The prompt people paste into ChatGPT, Claude or Gemini.
 * It asks for one code block, because every one of those apps puts a
 * one-click Copy button on code blocks — no dragging to select a long answer.
 */
export const EXTRACTION_PROMPT = `I'm setting up What's Next, an app that tells me which task to do first. Using what you know about me from our chats, fill in the profile below.

How to answer:
- Put your whole answer inside ONE code block, so I can copy it with one click. Write nothing before or after the code block.
- Keep every heading exactly as it is written.
- Use short bullet points: under 12 words each, at most 5 per heading.
- Only write what you actually know. If you're not sure, write: unknown

GOALS:
- My 1–3 most important goals right now, with a deadline if there is one (for example: Launch my portfolio by Oct 30)
NEXT STEPS:
- 3–7 concrete tasks I should do next to reach those goals
HIGH-VALUE WORK:
- The kind of work that really moves my goals forward
I PUT OFF:
- Important things I tend to delay or avoid
BUSYWORK:
- Things I do to feel busy that don't really matter
FOCUS TIME:
- When I focus best, and my regular commitments
LIMITS:
- Limits on my time, money or energy
ABOUT ME:
- What I do and the projects I'm working on
WORKING STYLE:
- How I like to work`

const HEADER_RE: Array<[KBFieldKey, RegExp]> = [
  ['goals', /^(?:my\s+)?(?:top\s+)?goals?$/],
  ['nextSteps', /^next\s*steps?$/],
  ['highValue', /^high[\s-]*value\s*work$/],
  ['avoidance', /^(?:avoidance(?:\s*patterns?)?|i\s*put\s*off|things\s*i\s*put\s*off|put\s*off)$/],
  ['busywork', /^busy[\s-]*work$/],
  ['energy', /^(?:energy(?:\s*(?:&|and)\s*schedule)?|focus\s*time)$/],
  ['constraints', /^(?:constraints?|limits?)$/],
  ['role', /^(?:role(?:\s*(?:&|and)\s*projects?)?|about\s*me)$/],
  ['style', /^working\s*style$/],
]

function headerKey(label: string): KBFieldKey | null {
  const clean = label.toLowerCase().replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim()
  for (const [key, re] of HEADER_RE) if (re.test(clean)) return key
  return null
}

function isUnknown(v: string) {
  return !v.trim() || /^(unknown|n\/?a|none|not sure|-)\.?$/i.test(v.trim())
}

/** True when someone pasted our own prompt back instead of their assistant's answer. */
export function looksLikePrompt(raw: string): boolean {
  return /so I can copy it with one click|I'm setting up What's Next/i.test(raw)
}

/** Parse the pasted profile into fields. Tolerates code fences, markdown, bullets and bold headers. */
export function parseProfile(raw: string): KBField[] {
  if (looksLikePrompt(raw)) return []
  const found = new Map<KBFieldKey, string[]>()
  let current: KBFieldKey | null = null
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) continue
    const m = /^\s*[#>*\-\s]*\**\s*([A-Za-z][A-Za-z &/-]{2,30}?)\s*\**\s*(?::\s*\**\s*(.*))?$/.exec(line)
    const key = m ? headerKey(m[1]) : null
    if (key) {
      current = key
      found.set(key, m![2] ? [m![2]] : [])
      continue
    }
    if (current && line.trim()) found.get(current)!.push(line)
  }
  const fields: KBField[] = []
  for (const { key } of KB_FIELDS) {
    const lines = found.get(key)
    if (!lines) continue
    const value = lines
      .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim())
      .filter((l) => l && !isUnknown(l))
      .join('\n')
      .trim()
    if (!isUnknown(value)) fields.push({ key, value, confirmed: false })
  }
  return fields
}

/**
 * Split a field into its items: one per line, or "1) … 2) …" inline numbering,
 * or semicolons for a single run-on line.
 */
export function listItems(value: string): string[] {
  const clean = (s: string) => s.replace(/^\s*(?:[-*•·]|\(?\d+[.)])\s*/, '').replace(/[.;,\s]+$/, '').trim()
  const lines = value.split(/\r?\n/).map(clean).filter(Boolean)
  let items = lines
  if (lines.length === 1) {
    const one = lines[0]
    // Only single-digit list markers count, so "in 2026. Then…" never splits.
    const numbered = one.split(/(?:^|\s)\(?[1-9][.)]\s+/).map(clean).filter(Boolean)
    items = numbered.length > 1 ? numbered : one.split(/;\s*/).map(clean).filter(Boolean)
  }
  return items.filter((i) => i.length > 1 && !isUnknown(i))
}

/** First clause of a sentence — enough to name a goal. */
function firstClause(text: string): string {
  return text.split(/;|\.\s|\s[—–]\s/)[0].trim()
}

/** Keep titles scannable: cut at a natural break instead of mid-thought. */
export function shorten(text: string, maxWords: number): string {
  const count = (s: string) => s.trim().split(/\s+/).length
  if (count(text) <= maxWords) return text
  // The earliest natural break that still leaves a meaningful head wins.
  const breaks = /,\s|\s+(?:and|with|targeting|so(?:\s+that)?|while|including|because|which|who)\s+|\s+\(/gi
  for (const m of text.matchAll(breaks)) {
    const head = text.slice(0, m.index).trim()
    if (count(head) >= 3 && count(head) <= maxWords) return head
    if (count(head) > maxWords) break
  }
  return text.split(/\s+/).slice(0, maxWords).join(' ')
}

export interface ProfileGoal {
  title: string
  /** YYYY-MM-DD */
  deadline: string | null
}

/** The person's goals, ready to become goals in the app. */
export function extractGoals(fields: KBField[], now: Date, max = 3): ProfileGoal[] {
  const value = fields.find((f) => f.key === 'goals')?.value ?? ''
  const out: ProfileGoal[] = []
  for (const item of listItems(value)) {
    const clause = firstClause(item)
    const parsed = parseGoalInput(clause, now)
    const deadline = parsed.deadline ?? parseGoalInput(item, now).deadline
    const title = capitalize(shorten(parsed.title || clause, 10).replace(/[,:;\s]+$/, ''))
    if (title && !out.some((g) => g.title.toLowerCase() === title.toLowerCase())) out.push({ title, deadline })
    if (out.length >= max) break
  }
  return out
}

/** Concrete next steps. Dates and effort stay in, so the task parser can read them. */
export function extractNextSteps(fields: KBField[], max = 8): string[] {
  const value = fields.find((f) => f.key === 'nextSteps')?.value ?? ''
  return listItems(value)
    .map((i) => capitalize(shorten(firstClause(i), 14)))
    .filter(Boolean)
    .slice(0, max)
}

/** Assign each step to the goal it most clearly serves, or leave it on its own. */
export function groupSteps(steps: string[], goals: ProfileGoal[]): { byGoal: string[][]; other: string[] } {
  const temp: Goal[] = goals.map((g, i) => ({
    id: String(i),
    title: g.title,
    deadline: g.deadline,
    position: i,
    createdAt: '',
    updatedAt: '',
    completedAt: null,
  }))
  const byGoal: string[][] = goals.map(() => [])
  const other: string[] = []
  for (const s of steps) {
    const { goalId } = matchGoal(s, temp)
    if (goalId !== null) byGoal[Number(goalId)].push(s)
    else other.push(s)
  }
  return { byGoal, other }
}

const LEADS =
  /^(?:and\s+)?(?:i\s+)?(?:often\s+|usually\s+|tend\s+to\s+|always\s+)?(?:delay(?:ing)?|avoid(?:ing)?|put(?:ting)?\s+off|procrastinate\s+(?:on)?|postpone|struggle\s+(?:with|to)|skip(?:ping)?|push(?:ing)?\s+back|neglect(?:ing)?|dodge|dread(?:ing)?)\s+/i

/** Long phrases get cut at a relative clause or preposition: "case studies that show…" → "case studies". */
function trimPhrase(p: string): string {
  const words = p.split(/\s+/)
  if (words.length <= 5) return p
  const m = /\s(?:that|which|who|where|when|because|so|for|to|with|in|on|by|about|like)\s/i.exec(p)
  if (m && m.index > 0) {
    const head = p.slice(0, m.index).trim()
    if (head.split(/\s+/).length <= 5) return head
  }
  return p
}

function phrases(text: string): string[] {
  return text
    .split(/[\n;.]|,|\band\b|\bor\b|→|->/i)
    .map((p) =>
      trimPhrase(
        p
          .trim()
          .replace(LEADS, '')
          .replace(/^(?:tasks?\s+like|things\s+like|like|such\s+as|especially|mostly|mainly|e\.g\.)\s+/i, '')
          .replace(/^(?:i\s+)?(?:use|do|spend\s+time\s+on)\s+/i, '')
          .replace(/\(.*?\)/g, '')
          .replace(/\s+(?:to|for|with|on|in|of|by)\s*$/i, '')
          .trim(),
      ),
    )
    .filter((p) => p.length > 2 && p.split(/\s+/).length <= 5 && keywords(p).length > 0)
    .map((p) => p.toLowerCase())
}

const BUSY_RE = /busy\s*work|feel(?:ing)?\s+(?:productive|busy)|instead\s+of|procrastinate\s+(?:by|with)|distract|fidget|tinker|rabbit\s*hole/i

function peakFrom(text: string): [number, number] | null {
  const t = text.toLowerCase()
  const range = /(\d{1,2})(?::\d{2})?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::\d{2})?\s*(am|pm)/.exec(t)
  if (range) {
    const to24 = (h: number, ap?: string) => (ap === 'pm' && h < 12 ? h + 12 : ap === 'am' && h === 12 ? 0 : h)
    const endAp = range[4]
    const start = to24(+range[1], range[2] ?? endAp)
    const end = to24(+range[3], endAp)
    if (end > start) return [start, end]
  }
  const focusClause = t.split(/[.;\n]/).find((c) => /focus|best|sharp|energ|productive|deep work|peak/.test(c)) ?? t
  if (/early\s+morning|before\s+(?:8|9)|at\s+dawn/.test(focusClause)) return [6, 10]
  if (/morning|before\s+(?:noon|lunch)|a\.?m\.?\b/.test(focusClause)) return [8, 12]
  if (/late(?:\s+at)?\s+night|night\s+owl|after\s+(?:10|11)\s*pm|midnight/.test(focusClause)) return [21, 24]
  if (/evening|night/.test(focusClause)) return [18, 22]
  if (/afternoon|after\s+lunch/.test(focusClause)) return [13, 17]
  return null
}

const dedupe = (xs: string[]) => [...new Set(xs)].slice(0, 12)

export function deriveSignals(fields: KBField[]): KBSignals {
  const get = (k: KBFieldKey) => fields.find((f) => f.key === k)?.value ?? ''
  const avoid: string[] = []
  const busywork: string[] = []
  // Older profiles mix "things I put off" and "busywork" in one field.
  for (const item of listItems(get('avoidance'))) {
    for (const clause of item.split(/[;.]/)) {
      if (!clause.trim()) continue
      ;(BUSY_RE.test(clause) ? busywork : avoid).push(...phrases(clause.replace(BUSY_RE, ' ')))
    }
  }
  for (const item of listItems(get('busywork'))) busywork.push(...phrases(item.replace(BUSY_RE, ' ')))
  return {
    highValue: dedupe(listItems(get('highValue')).flatMap(phrases)),
    avoid: dedupe(avoid),
    busywork: dedupe(busywork),
    peak: peakFrom(get('energy')),
  }
}

/** "Mornings · 8–11 AM" */
export function focusLabel(peak: [number, number] | null): string | null {
  if (!peak) return null
  const [a, b] = peak
  const h = (x: number) => {
    const v = x % 24
    return { n: v % 12 === 0 ? 12 : v % 12, pm: v >= 12 }
  }
  const s = h(a)
  const e = h(b)
  const range = s.pm === e.pm ? `${s.n}–${e.n} ${e.pm ? 'PM' : 'AM'}` : `${s.n} ${s.pm ? 'PM' : 'AM'}–${e.n} ${e.pm ? 'PM' : 'AM'}`
  const mid = (a + b) / 2
  const part = mid < 8.5 ? 'Early mornings' : mid < 12.5 ? 'Mornings' : mid < 17.5 ? 'Afternoons' : mid < 21 ? 'Evenings' : 'Late nights'
  return `${part} · ${range}`
}

/** Everything the app takes from a profile, in one place. */
export interface ProfileAnalysis {
  goals: ProfileGoal[]
  nextSteps: string[]
  /** Which goal each next step serves, when the model said so. */
  stepGoals?: Array<number | null>
  signals: KBSignals
}

export function analyzeProfile(fields: KBField[], now: Date): ProfileAnalysis {
  return { goals: extractGoals(fields, now), nextSteps: extractNextSteps(fields), signals: deriveSignals(fields) }
}

function termMatches(term: string, task: Task): boolean {
  const tk = keywords(term)
  if (!tk.length) return false
  const taskKw = keywords(`${task.title} ${task.notes}`)
  if (overlap(tk, taskKw) >= 0.5) return true
  // Short category-like terms ("outreach", "sales calls") match by kind of work.
  if (tk.length <= 2) {
    const cat = guessCategory(term)
    if (cat !== 'other' && cat === task.category) return true
  }
  return false
}

export function matchKB(task: Task, kb: KnowledgeBase | null): KBMatch | null {
  if (!kb) return null
  const s = kb.signals
  for (const phrase of s.avoid) if (termMatches(phrase, task)) return { kind: 'avoid', phrase }
  for (const phrase of s.highValue) if (termMatches(phrase, task)) return { kind: 'highValue', phrase }
  for (const phrase of s.busywork) {
    // Busywork needs a direct word match; category alone is too broad.
    if (overlap(keywords(phrase), keywords(task.title)) >= 0.5) return { kind: 'busywork', phrase }
  }
  return null
}

export function fieldLabel(key: KBFieldKey): string {
  return KB_FIELDS.find((f) => f.key === key)?.label ?? key
}
