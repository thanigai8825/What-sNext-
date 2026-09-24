import { getSupabase, supabaseAnonKey, supabaseConfigured, supabaseUrl } from '../data/supabase'

export type AIKind = 'parse_tasks' | 'rank' | 'profile'

function endpoint(): string {
  if (import.meta.env.VITE_AI_ENDPOINT) return import.meta.env.VITE_AI_ENDPOINT
  if (supabaseConfigured) return `${supabaseUrl}/functions/v1/ai`
  return '/api/ai'
}

async function headers(): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (supabaseConfigured) {
    const sb = await getSupabase()
    const token = (await sb?.auth.getSession())?.data.session?.access_token
    h.Authorization = `Bearer ${token ?? supabaseAnonKey}`
    h.apikey = supabaseAnonKey!
  }
  return h
}

/** Ask the server whether a model is configured. Never throws. */
export async function checkAI(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = window.setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(endpoint(), { headers: await headers(), signal: ctrl.signal })
    window.clearTimeout(timer)
    if (!res.ok) return false
    const json = (await res.json()) as { enabled?: boolean }
    return !!json.enabled
  } catch {
    return false
  }
}

/** Stream raw text. Resolves with the full text; rejects on network/HTTP failure. */
export async function streamText(kind: AIKind, input: unknown, onDelta?: (all: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({ kind, input }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`AI ${kind} failed: ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    onDelta?.(text)
  }
  return text
}

function parseLine<T>(line: string): T | null {
  const clean = line.trim().replace(/^```(?:json|ndjson)?/, '').replace(/```$/, '').trim()
  if (!clean.startsWith('{')) return null
  try {
    return JSON.parse(clean) as T
  } catch {
    return null
  }
}

/**
 * Stream NDJSON: `onItem` fires as each line completes; `onPartial` sees the
 * line still being written, so a reason can appear word by word.
 */
export async function streamNDJSON<T>(
  kind: AIKind,
  input: unknown,
  opts: { onItem?: (item: T) => void; onPartial?: (line: string) => void; signal?: AbortSignal } = {},
): Promise<T[]> {
  const items: T[] = []
  let consumed = 0
  const flush = (all: string, final: boolean) => {
    const lines = all.slice(consumed).split('\n')
    const rest = final ? '' : lines.pop() ?? ''
    for (const l of lines) {
      const item = parseLine<T>(l)
      if (item) {
        items.push(item)
        opts.onItem?.(item)
      }
    }
    consumed = all.length - rest.length
    if (rest) opts.onPartial?.(rest)
  }
  const text = await streamText(kind, input, (all) => flush(all, false), opts.signal)
  flush(text, true)
  return items
}

/** Pull a still-streaming string field out of an incomplete JSON line. */
export function partialField(line: string, field: string): string | null {
  const m = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`).exec(line)
  if (!m) return null
  try {
    return JSON.parse(`"${m[1].replace(/\\$/, '')}"`)
  } catch {
    return m[1]
  }
}
