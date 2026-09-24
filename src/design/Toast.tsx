import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { tBase } from '../lib/motion'
import { useUI } from '../store/ui'

const DURATION = 5000

/** One calm toast at a time, bottom center. Every action can be undone for 5 seconds. */
export function ToastHost({ offsetForTabs }: { offsetForTabs: boolean }) {
  const toast = useUI((s) => s.toast)
  const dismiss = useUI((s) => s.dismissToast)
  const overSheet = useUI((s) => s.sheets > 0)
  const [hover, setHover] = useState(false)
  const remaining = useRef(DURATION)
  const started = useRef(0)

  useEffect(() => {
    remaining.current = DURATION
  }, [toast?.id])

  useEffect(() => {
    if (!toast || hover) return
    started.current = Date.now()
    const t = window.setTimeout(dismiss, remaining.current)
    return () => {
      window.clearTimeout(t)
      remaining.current -= Date.now() - started.current
    }
  }, [toast, hover, dismiss])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
      style={
        overSheet
          ? { top: 'calc(env(safe-area-inset-top) + 12px)' }
          : { bottom: offsetForTabs ? 'calc(env(safe-area-inset-bottom) + 76px)' : 'calc(env(safe-area-inset-bottom) + 24px)' }
      }
      role="status"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {toast && (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: overSheet ? -16 : 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={tBase}
            onHoverStart={() => setHover(true)}
            onHoverEnd={() => setHover(false)}
            className={`pointer-events-auto flex h-11 items-center gap-1 rounded-pill bg-toast pl-4 text-caption text-on-toast ${toast.action ? "pr-1.5" : "pr-4"}`}
          >
            <span className="font-medium">{toast.message}</span>
            {toast.action && (
              <>
                <span aria-hidden className="px-1 opacity-40">
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => {
                    toast.action!.run()
                    dismiss()
                  }}
                  className="h-8 rounded-pill px-2.5 font-medium underline-offset-2 opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-on-toast"
                >
                  {toast.action.label}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
