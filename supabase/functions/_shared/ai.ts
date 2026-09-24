/**
 * Server-side Claude access, shared by the Supabase Edge Function (Deno) and
 * the Vite dev server (Node). Prompts live here, not in the browser, so the
 * API key and the instructions never ship to clients.
 *
 * Every kind streams NDJSON — one JSON object per line — so the app can render
 * each task, score or reason the moment its line completes.
 */
import Anthropic from '@anthropic-ai/sdk'

export const DEFAULT_MODEL = 'claude-opus-5'

export type AIKind = 'parse_tasks' | 'rank' | 'profile'

const KINDS: AIKind[] = ['parse_tasks', 'rank', 'profile']

export function isAIKind(x: unknown): x is AIKind {
  return typeof x === 'string' && (KINDS as string[]).includes(x)
}

/** Keep requests bounded; a task list is never this large. */
export const MAX_INPUT_BYTES = 120_000

const VOICE = `Voice: calm, specific, brief. Second person. Sentence case. No hype, no exclamation marks, never guilt, never "high priority" or "overdue" (say "carried over"). Talk about outcomes, not labels. Mention people, deadlines and goals by name when it helps.`

const FORMAT = `Output only NDJSON: one compact JSON object per line. No prose, no markdown, no code fences. Latency-sensitive: begin your answer immediately.`

interface Built {
  system: string
  user: string
  maxTokens: number
}

function build(kind: AIKind, input: unknown): Built {
  const data = JSON.stringify(input)
  switch (kind) {
    case 'parse_tasks':
      return {
        system: `You turn a person's messy task list into clean, structured tasks for "What's Next?", an app that answers one question: what should I do right now?

For each input line, output one object, in the same order:
{"i": line index, "title": short imperative title in sentence case (max 60 chars) without dates, durations or hashtags, "due": local "YYYY-MM-DDTHH:mm" or null (a bare day means the end of their work day, dayEndHour:00), "dueHasTime": true only if a time of day was given, "effort": realistic minutes as an integer (estimate if not stated), "goalId": id of the goal this task most directly advances, or null if none clearly fits, "person": first name of the other person involved or null, "category": one of deep|outreach|admin|learning|meeting|other, "after": index of another line this task must wait for, or null}

Use the profile to understand their projects when linking goals. Do not invent deadlines.
${FORMAT}`,
        user: data,
        maxTokens: 4000,
      }
    case 'rank':
      return {
        system: `You are the prioritization engine inside "What's Next?". The person's problem: when it's time to work they pick easy, low-value tasks because those feel productive. Your job is to judge what actually matters.

For every task, output one object, most important first:
{"id": task id, "impact": 0–1 for how much finishing it moves their goals or real obligations (busywork ≈ 0.1, core goal work 0.8–1), "reason": one sentence (max 22 words) on why to do it now, "now": one short sentence (max 16 words) on what doing it now makes possible, "delay": one short sentence (max 16 words) on the calm, honest cost of waiting}

Weigh: impact on their goals most, then deadline urgency (handoffs to other people need lead time), how many tasks it unblocks, effort versus the time they have, their energy right now, and what their profile says. If the profile says they tend to put off this kind of task and it matters, say so gently, e.g. "You mentioned you tend to put off outreach. This is the one to do first."
${VOICE}
${FORMAT}`,
        user: data,
        maxTokens: 6000,
      }
    case 'profile':
      return {
        system: `You read a person's self-description for a task-prioritization app and extract matching signals.
Output exactly one line:
{"highValue": short phrases (1–3 words) naming work that moves their goals, "avoid": short phrases for important work they tend to put off, "busywork": short phrases for low-value work they use to feel productive, "peak": [startHour, endHour] in 24h local time when they focus best, or null}
Use their own words where possible. Empty arrays are fine.
${FORMAT}`,
        user: data,
        maxTokens: 800,
      }
  }
}

export interface StreamOptions {
  apiKey: string
  model?: string
  kind: AIKind
  input: unknown
  signal?: AbortSignal
}

/** Stream the model's text as UTF-8 bytes. Errors end the stream; the app falls back to its local engine. */
export function streamAI({ apiKey, model, kind, input, signal }: StreamOptions): ReadableStream<Uint8Array> {
  const client = new Anthropic({ apiKey })
  const { system, user, maxTokens } = build(kind, input)
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = client.beta.messages.stream(
          {
            model: model || DEFAULT_MODEL,
            max_tokens: maxTokens,
            // Parsing and ranking are quick judgments; keep them snappy.
            output_config: { effort: 'low' },
            // If a request is ever declined by a safety classifier, retry it on
            // Anthropic's recommended fallback model instead of failing.
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system,
            messages: [{ role: 'user', content: user }],
          },
          { signal },
        )
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
        const final = await stream.finalMessage()
        if (final.stop_reason === 'refusal') console.warn('[ai] request declined', kind)
        controller.close()
      } catch (err) {
        if (err instanceof Anthropic.APIError) console.error(`[ai] ${kind} failed: ${err.status} ${err.message}`)
        else if (!(err instanceof Error && err.name === 'AbortError')) console.error('[ai]', err)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
  })
}
