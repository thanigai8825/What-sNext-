import { AnimatePresence, motion } from 'motion/react'
import { RotateCcw, X } from 'lucide-react'
import { MicroLabel } from '../design'
import { focusLabel } from '../engine/kb'
import { capitalize } from '../engine/text'
import type { KBSignals } from '../engine/types'
import { cn } from '../lib/cn'
import { springPop, tBase } from '../lib/motion'

type Kind = 'highValue' | 'avoid' | 'busywork'

const GROUPS: Array<{ kind: Kind; label: string }> = [
  { kind: 'highValue', label: 'We’ll put these first' },
  { kind: 'avoid', label: 'We’ll nudge you on these' },
  { kind: 'busywork', label: 'We’ll keep these out of your way' },
]

export const chipKey = (kind: Kind, phrase: string) => `${kind}:${phrase}`

/** Drop what the person struck out on the review screen. */
export function withoutRemoved(signals: KBSignals, removed: string[]): KBSignals {
  const keep = (kind: Kind) => signals[kind].filter((p) => !removed.includes(chipKey(kind, p)))
  return { ...signals, highValue: keep('highValue'), avoid: keep('avoid'), busywork: keep('busywork') }
}

/**
 * What the app learned, phrased as what it will do with it. Short chips instead
 * of paragraphs; tap one to strike it out, tap again to bring it back.
 */
export function ProfileSummary({ signals, removed, onToggle }: { signals: KBSignals; removed: string[]; onToggle: (key: string) => void }) {
  const focus = focusLabel(signals.peak)
  const groups = GROUPS.filter((g) => signals[g.kind].length)
  if (!groups.length && !focus) {
    return <p className="rounded-card bg-surface px-4 py-4 text-body text-ink-2">We’ll learn how you work as you use the app.</p>
  }
  return (
    <div className="overflow-hidden rounded-card bg-surface [&>*+*]:border-t [&>*+*]:border-line">
      {groups.map((g, gi) => (
        <motion.section
          key={g.kind}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...tBase, delay: 0.05 + gi * 0.06 }}
          className="px-4 py-4"
          aria-label={g.label}
        >
          <MicroLabel as="h2">{g.label}</MicroLabel>
          <ul className="mt-3 flex flex-wrap gap-2">
            <AnimatePresence initial={false}>
              {signals[g.kind].map((phrase) => {
                const key = chipKey(g.kind, phrase)
                const off = removed.includes(key)
                return (
                  <motion.li key={key} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={springPop}>
                    <button
                      type="button"
                      onClick={() => onToggle(key)}
                      aria-pressed={!off}
                      aria-label={off ? `Bring back ${phrase}` : `Remove ${phrase}`}
                      className={cn(
                        'relative inline-flex h-9 items-center gap-1.5 rounded-pill pr-2.5 pl-3 text-caption font-medium transition-colors duration-200 before:absolute before:-inset-1 before:content-[""]',
                        off ? 'bg-canvas text-ink-3 line-through decoration-line-strong' : 'bg-lavender-bg text-lavender',
                      )}
                    >
                      {capitalize(phrase)}
                      {off ? <RotateCcw size={13} strokeWidth={1.75} aria-hidden /> : <X size={13} strokeWidth={1.75} aria-hidden />}
                    </button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </motion.section>
      ))}
      {focus && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...tBase, delay: 0.05 + groups.length * 0.06 }}
          className="px-4 py-4"
        >
          <MicroLabel as="h2">We’ll save deep work for</MicroLabel>
          <p className="mt-2 text-body text-ink">{focus}</p>
        </motion.section>
      )}
    </div>
  )
}
