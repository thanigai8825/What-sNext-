import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, Check, ClipboardPaste, Copy, X } from 'lucide-react'
import { Button, IconButton, Sheet, TextArea } from '../design'
import { analyzeProfile, EXTRACTION_PROMPT, looksLikePrompt, parseProfile, type ProfileAnalysis } from '../engine/kb'
import type { KBField } from '../engine/types'
import { cn } from '../lib/cn'
import { isTyping, useIsDesktop } from '../lib/hooks'
import { spring, springPop, tBase } from '../lib/motion'

const ASSISTANTS = [
  { name: 'ChatGPT', url: (q: string) => `https://chatgpt.com/?q=${encodeURIComponent(q)}` },
  { name: 'Claude', url: (q: string) => `https://claude.ai/new?q=${encodeURIComponent(q)}` },
  { name: 'Gemini', url: () => 'https://gemini.google.com/app' },
]

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export type PasteState = 'empty' | 'prompt' | 'invalid' | 'ok'

export interface ProfilePreview {
  fields: KBField[]
  analysis: ProfileAnalysis
  state: PasteState
}

/** Parse as the person pastes, so feedback is instant. */
export function useProfilePreview(raw: string): ProfilePreview {
  return useMemo(() => {
    const fields = parseProfile(raw)
    const analysis = analyzeProfile(fields, new Date())
    const state: PasteState = !raw.trim() ? 'empty' : looksLikePrompt(raw) ? 'prompt' : fields.length ? 'ok' : 'invalid'
    return { fields, analysis, state }
  }, [raw])
}

function useCopy() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const copy = async () => {
    if (await copyText(EXTRACTION_PROMPT)) {
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2400)
    }
  }
  return { copied, copy }
}

/**
 * Three steps: copy the prompt, ask your AI, paste its answer.
 * Used in onboarding and in Settings → Knowledge base.
 */
export function KnowledgeImport({ raw, onRaw, preview }: { raw: string; onRaw: (raw: string) => void; preview: ProfilePreview }) {
  const { copied, copy } = useCopy()
  const [showPrompt, setShowPrompt] = useState(false)
  const [copiedOnce, setCopiedOnce] = useState(false)
  const [opened, setOpened] = useState(false)
  const done = preview.state === 'ok'

  // Anywhere on this screen, ⌘V / Ctrl+V drops the answer in.
  useEffect(() => {
    if (done) return
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e)) return
      const text = e.clipboardData?.getData('text') ?? ''
      if (text.trim()) {
        e.preventDefault()
        onRaw(text)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [done, onRaw])

  const doCopy = async () => {
    await copy()
    setCopiedOnce(true)
  }

  return (
    <>
      <ol className="space-y-8">
        <Step n={1} done={copiedOnce || opened || done} title="Copy the prompt">
          <div className="flex h-12 items-stretch overflow-hidden rounded-control bg-surface">
            <button
              type="button"
              onClick={doCopy}
              className="flex min-w-0 flex-1 items-center justify-center text-body font-medium whitespace-nowrap text-ink transition-colors duration-200 hover:bg-surface-hover"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={copied ? 'done' : 'copy'}
                  className="inline-flex items-center gap-2 max-[359px]:gap-1.5"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={springPop}
                >
                  {copied ? <Check size={18} strokeWidth={2} aria-hidden /> : <Copy size={18} strokeWidth={1.5} aria-hidden className="max-[359px]:hidden" />}
                  {copied ? 'Copied' : 'Copy prompt'}
                </motion.span>
              </AnimatePresence>
            </button>
            <span aria-hidden className="my-3 w-px bg-line-strong" />
            <button
              type="button"
              onClick={() => setShowPrompt(true)}
              className="flex min-w-0 flex-1 items-center justify-center text-body whitespace-nowrap text-ink-2 transition-colors duration-200 hover:bg-surface-hover hover:text-ink"
            >
              Show prompt
            </button>
          </div>
        </Step>

        <Step n={2} done={opened || done} title="Ask your AI" hint="It opens with the prompt copied. If the box is empty, just paste.">
          <div className="grid grid-cols-3 gap-2">
            {ASSISTANTS.map((a) => (
              <Button
                key={a.name}
                variant="secondary"
                className="h-11 gap-1 px-2 text-caption md:h-11"
                iconRight={ArrowUpRight}
                onClick={() => {
                  void doCopy()
                  setOpened(true)
                  window.open(a.url(EXTRACTION_PROMPT), '_blank', 'noopener,noreferrer')
                }}
              >
                {a.name}
              </Button>
            ))}
          </div>
        </Step>

        <Step n={3} done={done} title="Paste the answer here">
          <PasteZone raw={raw} onRaw={onRaw} preview={preview} />
        </Step>
      </ol>
      <PromptSheet open={showPrompt} onClose={() => setShowPrompt(false)} />
    </>
  )
}

function Step({ n, done, title, hint, children }: { n: number; done: boolean; title: string; hint?: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_1fr] gap-x-3">
      <span className="relative mt-px flex size-7 items-center justify-center" aria-hidden>
        <motion.span
          className={cn('absolute inset-0 rounded-pill', done ? 'bg-ink' : 'bg-surface')}
          animate={{ scale: done ? [1, 1.12, 1] : 1 }}
          transition={{ duration: 0.35 }}
        />
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.span key="check" className="relative text-on-primary" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springPop}>
              <Check size={15} strokeWidth={2.25} />
            </motion.span>
          ) : (
            <motion.span key="n" className="relative text-caption font-medium text-ink-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {n}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <div className="min-w-0">
        <p className="flex h-7 items-center text-body font-medium text-ink">
          <span className="sr-only">Step {n}{done ? ', done' : ''}: </span>
          {title}
        </p>
        <div className="mt-3">{children}</div>
        {hint && <p className="mt-2 text-caption text-ink-3">{hint}</p>}
      </div>
    </li>
  )
}

function PasteZone({ raw, onRaw, preview }: { raw: string; onRaw: (raw: string) => void; preview: ProfilePreview }) {
  const area = useRef<HTMLTextAreaElement>(null)
  const desktop = useIsDesktop()
  const [readFailed, setReadFailed] = useState(false)

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim()) {
        onRaw(text)
        return
      }
    } catch {
      /* permission denied or unsupported: fall back to the field */
    }
    setReadFailed(true)
    area.current?.focus()
  }

  const { analysis, state } = preview
  const goals = analysis.goals.length
  const steps = analysis.nextSteps.length
  const habits = analysis.signals.highValue.length + analysis.signals.avoid.length + analysis.signals.busywork.length

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state === 'ok' ? (
        <motion.div
          key="ok"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={spring}
          className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-card bg-surface py-3 pr-2 pl-4"
          role="status"
        >
          <span className="row-span-2 flex size-8 shrink-0 items-center justify-center self-start rounded-pill bg-sage-bg text-sage">
            <Check size={16} strokeWidth={2.25} aria-hidden />
          </span>
          <p className="text-body font-medium text-ink">Answer received</p>
          <Button variant="text" className="-my-2 h-10 text-caption" onClick={() => onRaw('')}>
            Replace
          </Button>
          <p className="col-span-2 pr-2 text-caption text-ink-2">{summary(goals, steps, habits)}</p>
        </motion.div>
      ) : (
        <motion.div key="paste" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tBase}>
          <div className="relative">
            <TextArea
              ref={area}
              minRows={3}
              maxHeight={220}
              value={raw}
              onChange={(e) => onRaw(e.target.value)}
              placeholder={desktop ? `Paste the answer here, or press ${PASTE_KEYS}` : 'Paste the answer here'}
              aria-label="Your AI’s answer"
              className="pr-28"
            />
            {!raw && (
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="absolute top-2.5 right-2.5 inline-flex h-8 items-center gap-1.5 rounded-pill bg-canvas px-3 text-caption font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)] transition-colors hover:bg-surface-hover"
              >
                <ClipboardPaste size={14} strokeWidth={1.75} aria-hidden />
                Paste
              </button>
            )}
          </div>
          <AnimatePresence initial={false}>
            {(state === 'invalid' || state === 'prompt' || readFailed) && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={tBase}
                className={cn('overflow-hidden pt-2 text-caption', state === 'empty' ? 'text-ink-3' : 'text-blush')}
              >
                {state === 'prompt'
                  ? 'That’s the prompt itself. Paste it into your AI first, then paste its answer here.'
                  : state === 'invalid'
                    ? 'That doesn’t look like the answer yet. Use the Copy button on your AI’s reply and paste it here.'
                    : 'Tap the box above, then choose Paste.'}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const PASTE_KEYS = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘V' : 'Ctrl+V'

function summary(goals: number, steps: number, habits: number) {
  const parts: string[] = []
  if (goals) parts.push(`${goals} ${goals === 1 ? 'goal' : 'goals'}`)
  if (steps) parts.push(`${steps} next ${steps === 1 ? 'step' : 'steps'}`)
  if (habits) parts.push('how you work')
  if (!parts.length) return 'We’ll use it to tailor your picks.'
  return `Found ${parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]}.`
}

/** The full prompt in an overlay: easy to read, smooth to scroll, one tap to copy. */
export function PromptSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { copied, copy } = useCopy()
  return (
    <Sheet open={open} onClose={onClose} label="The setup prompt" className="md:max-w-[560px]">
      <div className="-mt-1 mb-4 flex items-center justify-between gap-4">
        <h2 className="text-headline font-semibold text-ink">The setup prompt</h2>
        <IconButton icon={X} label="Close" onClick={onClose} className="-mr-2.5" data-autofocus />
      </div>
      <div className="relative">
        <div
          role="region"
          aria-label="Setup prompt"
          tabIndex={0}
          className="max-h-[min(52dvh,440px)] overflow-y-auto overscroll-contain scroll-smooth rounded-card bg-surface px-4 pt-4 pb-8 [-webkit-overflow-scrolling:touch]"
        >
          <p className="text-caption leading-[21px] whitespace-pre-wrap text-ink">{EXTRACTION_PROMPT}</p>
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-card bg-gradient-to-t from-surface to-transparent" />
      </div>
      <p className="mt-3 text-caption text-ink-3">It asks your AI to reply in one box with a Copy button, so you can copy the whole answer in one tap.</p>
      <Button full className="mt-5" icon={copied ? Check : Copy} onClick={copy}>
        {copied ? 'Copied' : 'Copy prompt'}
      </Button>
    </Sheet>
  )
}
