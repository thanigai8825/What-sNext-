const DAY = 86_400_000

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Local calendar day, YYYY-MM-DD. */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function atHour(d: Date, hour: number, minute = 0): Date {
  const x = new Date(d)
  x.setHours(hour, minute, 0, 0)
  return x
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY)
}

export function hoursUntil(iso: string, now: Date): number {
  return (new Date(iso).getTime() - now.getTime()) / 3_600_000
}

/** Compact label for rows and captions: Today · Tomorrow · Fri · Oct 3 */
export function dueLabel(iso: string, hasTime: boolean, now: Date): string {
  const d = new Date(iso)
  const diff = daysBetween(now, d)
  const time = hasTime ? ` ${timeLabel(d)}` : ''
  if (diff < 0) return diff === -1 ? 'Carried over from yesterday' : `Carried over from ${WEEKDAYS[d.getDay()].slice(0, 3)}`
  if (diff === 0) return hasTime ? `Today${time}` : 'Today'
  if (diff === 1) return `Tomorrow${time}`
  if (diff < 7) return `${WEEKDAYS[d.getDay()].slice(0, 3)}${time}`
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${time}`
}

/** For sentences: "today", "tomorrow", "Friday", "October 3" */
export function dueWords(iso: string, now: Date): string {
  const d = new Date(iso)
  const diff = daysBetween(now, d)
  if (diff <= 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff < 7) return WEEKDAYS[d.getDay()]
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function weekdayName(d: Date): string {
  return WEEKDAYS[d.getDay()]
}

export function dateLabel(key: string, now: Date): string {
  const d = fromDayKey(key)
  const diff = daysBetween(now, d)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()]
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export function timeLabel(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`
}

export function effortLabel(min: number): string {
  if (min < 60) return `${Math.max(5, Math.round(min / 5) * 5)} min`
  const h = min / 60
  const rounded = Math.round(h * 2) / 2
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} hr`
}

export function durationLabel(ms: number): string {
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'under a minute'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** "08:30" → minutes after midnight */
export function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function hmLabel(hm: string): string {
  const mins = parseHm(hm)
  return timeLabel(new Date(2000, 0, 1, Math.floor(mins / 60), mins % 60))
}
