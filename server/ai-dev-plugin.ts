import type { Connect, Plugin } from 'vite'
import type { ServerResponse } from 'node:http'
import { isAIKind, MAX_INPUT_BYTES, streamAI } from '../supabase/functions/_shared/ai.ts'

interface Options {
  apiKey?: string
  model?: string
}

/**
 * Serves /api/ai during `vite dev` and `vite preview`, so local development
 * talks to Claude through the same prompts as the Supabase Edge Function —
 * with the key kept on the server.
 */
export function aiDevServer({ apiKey, model }: Options): Plugin {
  const handler: Connect.NextHandleFunction = (req, res: ServerResponse) => {
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ enabled: !!apiKey }))
      return
    }
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end()
      return
    }
    if (!apiKey) {
      res.statusCode = 503
      res.end('AI is not configured. Set ANTHROPIC_API_KEY in .env.local.')
      return
    }
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_INPUT_BYTES) req.destroy()
      else chunks.push(c)
    })
    req.on('end', async () => {
      let body: { kind?: unknown; input?: unknown }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        res.statusCode = 400
        res.end('Invalid JSON')
        return
      }
      if (!isAIKind(body.kind)) {
        res.statusCode = 400
        res.end('Unknown kind')
        return
      }
      const abort = new AbortController()
      res.on('close', () => abort.abort())
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      const reader = streamAI({ apiKey, model, kind: body.kind, input: body.input, signal: abort.signal }).getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(value)
        }
      } finally {
        res.end()
      }
    })
  }

  return {
    name: 'whats-next-ai',
    configureServer(server) {
      server.middlewares.use('/api/ai', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/ai', handler)
    },
  }
}
