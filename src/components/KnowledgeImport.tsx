import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, Check, Copy } from 'lucide-react'
import { Button, TextArea } from '../design'
import { EXTRACTION_PROMPT, parseProfile } from '../engine/kb'
import type { KBField } from '../engine/types'
import { springPop, tBase } from '../lib/motion'

const ASSISTANTS = [
  { name: 'ChatGPT', url: (q: string) => `https://chatgpt.com/?q=${encodeURIComponent(q)}` },
  { name: 'Claude', url: (q: string) => `https://claude.ai/new?q=${encodeURIComponent(q)}` },
  { name: 'Gemini', url: () => 'https://gemini.google.com/app' },
]

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/** Copy the prompt, ask your assistant, paste the answer. */
export function KnowledgeImport({ onImport, primaryLabel = 'Import' }: { onImport: (raw: string, fields: KBField[]) => void; primaryLabel?: string }) {
  const [copied, setCopied] = useState(false)
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const doCopy = async () => {
    if (await copy(EXTRACTION_PROMPT)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2200)
    }
  }

  const submit = () => {
    const fields = parseProfile(raw)
    if (!fields.length) {
      setError('That doesn’t look like the profile yet. Paste the full answer, headings included.')
      return
    }
    setError(null)
    onImport(raw, fields)
  }

  return (
    <div>
      <div className="rounded-card bg-surface">
        <div className="relative px-4 pt-4">
          <motion.div animate={{ height: expanded ? 'auto' : 88 }} transition={tBase} className="overflow-hidden">
            <p className="text-caption whitespace-pre-line text-ink-2">{EXTRACTION_PROMPT}</p>
          </motion.div>
          {!expanded && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-2 pt-1 pb-2">
          <Button variant="text" onClick={() => setExpanded((e) => !e)} className="text-caption">
            {expanded ? 'Show less' : 'Show full prompt'}
          </Button>
          <span className="flex-1" />
          <Button variant="text" onClick={doCopy} className="text-ink" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={copied ? 'y' : 'n'} className="inline-flex items-center gap-1.5" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={springPop}>
                {copied ? <Check size={18} strokeWidth={1.75} aria-hidden /> : <Copy size={18} strokeWidth={1.5} aria-hidden />}
                {copied ? 'Copied' : 'Copy prompt'}
              </motion.span>
            </AnimatePresence>
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {ASSISTANTS.map((a) => (
          <Button
            key={a.name}
            variant="secondary"
            className="h-11 px-2 text-caption md:h-10"
            iconRight={ArrowUpRight}
            onClick={() => {
              void doCopy()
              window.open(a.url(EXTRACTION_PROMPT), '_blank', 'noopener,noreferrer')
            }}
          >
            {a.name}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-caption text-ink-3">Opens in a new tab with the prompt copied.</p>

      <TextArea
        className="mt-6"
        minRows={5}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value)
          setError(null)
        }}
        placeholder="Paste the answer here"
        aria-label="Profile from your assistant"
      />
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-2 text-caption text-blush">
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <Button full className="mt-6" disabled={raw.trim().length < 12} onClick={submit}>
        {primaryLabel}
      </Button>
    </div>
  )
}
