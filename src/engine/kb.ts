import { guessCategory, keywords, overlap } from './text'
import type { KBField, KBFieldKey, KBMatch, KBSignals, KnowledgeBase, Task } from './types'

export const KB_FIELDS: Array<{ key: KBFieldKey; label: string; header: string }> = [
  { key: 'goals', label: 'Goals', header: 'GOALS' },
  { key: 'role', label: 'Role & projects', header: 'ROLE & PROJECTS' },
  { key: 'highValue', label: 'High-value work', header: 'HIGH-VALUE WORK' },
  { key: 'avoidance', label: 'Avoidance patterns', header: 'AVOIDANCE PATTERNS' },
  { key: 'energy', label: 'Energy & schedule', header: 'ENERGY & SCHEDULE' },
  { key: 'constraints', label: 'Constraints', header: 'CONSTRAINTS' },
  { key: 'style', label: 'Working style', header: 'WORKING STYLE' },
]

export const EXTRACTION_PROMPT = `Based on everything you know about me from our conversations, create a profile to help a task-prioritization app understand me. Only include what you actually know; write 'unknown' where unsure. Use exactly this format:
GOALS: my top 1–3 current goals, with deadlines
ROLE & PROJECTS: what I do and my active projects
HIGH-VALUE WORK: tasks that actually move my goals forward
AVOIDANCE PATTERNS: tasks I delay, and busywork I use to feel productive
ENERGY & SCHEDULE: when I focus best, recurring commitments
CONSTRAINTS: time, money, or other limits
WORKING STYLE: how I prefer to work`

const HEADER_RE: Array<[KBFieldKey, RegExp]> = [
  ['goals', /^goals?$/],
  ['role', /^role\s*(?:&|and)\s*projects?$/],
  ['highValue', /^high[\s-]*value\s*work$/],
  ['avoidance', /^avoidance\s*patterns?$/],
  ['energy', /^energy\s*(?:&|and)\s*schedule$/],
  ['constraints', /^constraints?$/],
  ['style', /^working\s*style$/],
]

function headerKey(label: string): KBFieldKey | null {
  const clean = label.toLowerCase().replace(/[*_#>`]/g, '').trim()
  for (const [key, re] of HEADER_RE) if (re.test(clean)) return key
  return null
}

function isUnknown(v: string) {
  return !v.trim() || /^(unknown|n\/?a|none|not sure|-)\.?$/i.test(v.trim())
}

/** Parse the pasted profile into fields. Tolerates markdown, bullets and bold headers. */
export function parseProfile(raw: string): KBField[] {
  const found = new Map<KBFieldKey, string[]>()
  let current: KBFieldKey | null = null
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*[#>*\-\s]*\**\s*([A-Za-z][A-Za-z &-]{2,30}?)\s*\**\s*:\s*\**\s*(.*)$/.exec(line)
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
      .filter(Boolean)
      .join('\n')
      .trim()
    if (!isUnknown(value)) fields.push({ key, value, confirmed: false })
  }
  return fields
}

const LEADS =
  /^(?:and\s+)?(?:i\s+)?(?:often\s+|usually\s+|tend\s+to\s+|always\s+)?(?:delay(?:ing)?|avoid(?:ing)?|put(?:ting)?\s+off|procrastinate\s+(?:on)?|postpone|struggle\s+(?:with|to)|skip(?:ping)?|push(?:ing)?\s+back|neglect(?:ing)?|dodge|dread(?:ing)?)\s+/i

function phrases(text: string): string[] {
  return text
    .split(/[\n;.]|,|\band\b|\bor\b/i)
    .map((p) =>
      p
        .trim()
        .replace(LEADS, '')
        .replace(/^(?:tasks?\s+like|things\s+like|like|such\s+as|especially|mostly|mainly|e\.g\.)\s+/i, '')
        .replace(/^(?:i\s+)?(?:use|do|spend\s+time\s+on)\s+/i, '')
        .replace(/\(.*?\)/g, '')
        .replace(/\s+(?:to|for|with|on|in|of|by)\s*$/i, '')
        .trim(),
    )
    .filter((p) => p.length > 2 && p.split(/\s+/).length <= 5 && keywords(p).length > 0)
    .map((p) => p.toLowerCase())
}

const BUSY_RE = /busy\s*work|feel(?:ing)?\s+productive|instead\s+of|procrastinate\s+(?:by|with)|distract|fidget|tinker|rabbit\s*hole/i

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
  if (/late\s+night|night\s+owl|after\s+(?:10|11)\s*pm|midnight/.test(focusClause)) return [21, 24]
  if (/evening|night/.test(focusClause)) return [18, 22]
  if (/afternoon|after\s+lunch/.test(focusClause)) return [13, 17]
  return null
}

export function deriveSignals(fields: KBField[]): KBSignals {
  const get = (k: KBFieldKey) => fields.find((f) => f.key === k)?.value ?? ''
  const avoid: string[] = []
  const busywork: string[] = []
  for (const clause of get('avoidance').split(/[\n;.]/)) {
    if (!clause.trim()) continue
    ;(BUSY_RE.test(clause) ? busywork : avoid).push(...phrases(clause.replace(BUSY_RE, ' ')))
  }
  return {
    highValue: [...new Set(phrases(get('highValue')))].slice(0, 12),
    avoid: [...new Set(avoid)].slice(0, 12),
    busywork: [...new Set(busywork)].slice(0, 12),
    peak: peakFrom(get('energy')),
  }
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
