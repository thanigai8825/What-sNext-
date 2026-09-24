import { AnimatePresence, motion } from 'motion/react'
import { tBase } from '../lib/motion'

/** Text that can arrive token by token. Finished text crossfades when it changes. */
export function StreamingText({ text, streaming, className }: { text: string; streaming?: boolean; className?: string }) {
  if (streaming) {
    return (
      <p className={className}>
        {text}
        <motion.span
          aria-hidden
          className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] rounded-pill bg-ink-3"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </p>
    )
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.p key={text} className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tBase}>
        {text}
      </motion.p>
    </AnimatePresence>
  )
}
