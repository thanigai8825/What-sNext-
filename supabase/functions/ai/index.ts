// Supabase Edge Function: streams Claude responses for What's Next.
// Deploy: supabase functions deploy ai && supabase secrets set ANTHROPIC_API_KEY=...
import { isAIKind, MAX_INPUT_BYTES, streamAI } from '../_shared/ai.ts'

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')

  if (req.method === 'GET') {
    return Response.json({ enabled: !!apiKey }, { headers: cors })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })
  if (!apiKey) return new Response('AI is not configured', { status: 503, headers: cors })

  const text = await req.text()
  if (text.length > MAX_INPUT_BYTES) return new Response('Too large', { status: 413, headers: cors })
  let body: { kind?: unknown; input?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: cors })
  }
  if (!isAIKind(body.kind)) return new Response('Unknown kind', { status: 400, headers: cors })

  const stream = streamAI({
    apiKey,
    model: Deno.env.get('AI_MODEL') ?? undefined,
    kind: body.kind,
    input: body.input,
    signal: req.signal,
  })
  return new Response(stream, {
    headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
})
