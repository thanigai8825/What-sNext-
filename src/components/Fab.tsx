import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { useIsDesktop } from '../lib/hooks'
import { spring, springPop } from '../lib/motion'
import { useUI } from '../store/ui'

/** Floating add button: black circle, bottom right. N on desktop. */
export function Fab() {
  const open = useUI((s) => s.setQuickAdd)
  const toast = useUI((s) => !!s.toast)
  const desktop = useIsDesktop()
  // On phones the toast sits where the button is; step aside for it.
  const lift = toast && !desktop ? -60 : 0
  return (
    <motion.button
      type="button"
      aria-label="New task"
      title="New task (N)"
      onClick={() => open(true)}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, y: lift, transition: { ...springPop, y: spring } }}
      exit={{ scale: 0.6, opacity: 0 }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.92 }}
      transition={springPop}
      className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+80px)] z-30 flex size-14 items-center justify-center rounded-pill bg-primary text-on-primary md:right-10 md:bottom-10"
    >
      <Plus size={24} strokeWidth={1.75} aria-hidden />
    </motion.button>
  )
}
