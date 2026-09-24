import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ease } from '../lib/motion'

/** Height animates smoothly; content fades in 50ms after. */
export function Collapse({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id}
          key="collapse"
          initial={{ height: 0 }}
          animate={{ height: 'auto', transition: { duration: 0.35, ease } }}
          exit={{ height: 0, transition: { duration: 0.28, ease } }}
          className="overflow-hidden"
        >
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease, delay: 0.05 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
