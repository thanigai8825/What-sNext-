import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react'
import { useIsDesktop } from '../lib/hooks'
import { tBase, tSlow } from '../lib/motion'
import { cn } from '../lib/cn'
import { useUI } from '../store/ui'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/** Only the top-most sheet answers Esc and traps Tab. */
const stack: string[] = []

interface SheetProps {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
  className?: string
  /** 'clear' keeps what's behind fully visible, e.g. a reward the sheet follows. */
  backdrop?: 'blur' | 'clear'
  /** 'bottom' docks at the bottom on desktop too. */
  placement?: 'auto' | 'bottom'
}

/** Slides up from the bottom on mobile, centers on desktop, over a soft blur. */
export function Sheet({ open, onClose, label, children, className, backdrop = 'blur', placement = 'auto' }: SheetProps) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <SheetPanel onClose={onClose} label={label} className={className} backdrop={backdrop} placement={placement}>
          {children}
        </SheetPanel>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function SheetPanel({ onClose, label, children, className, backdrop, placement }: Omit<SheetProps, 'open'>) {
  const id = useId()
  const wide = useIsDesktop()
  const desktop = wide && placement !== 'bottom'
  const reduce = useReducedMotion()
  const panel = useRef<HTMLDivElement>(null)
  const drag = useDragControls()
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    stack.push(id)
    useUI.getState().pushSheet()
    const prev = document.activeElement as HTMLElement | null
    const el = panel.current
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el
    requestAnimationFrame(() => first?.focus({ preventScroll: true }))
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close.current()
      } else if (e.key === 'Tab' && el) {
        const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null)
        if (!nodes.length) return e.preventDefault()
        const a = nodes[0]
        const z = nodes[nodes.length - 1]
        if (e.shiftKey && (document.activeElement === a || document.activeElement === el)) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      stack.splice(stack.indexOf(id), 1)
      useUI.getState().popSheet()
      if (!stack.length) document.body.style.overflow = overflow
      prev?.focus?.({ preventScroll: true })
    }
  }, [id])

  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
  const motionProps = reduce
    ? fade
    : desktop
      ? { initial: { opacity: 0, scale: 0.97, y: 8 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.98, y: 4 } }
      : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }

  return (
    <div className={cn('fixed inset-0 z-50 flex items-end justify-center md:p-6', placement !== 'bottom' && 'md:items-center')}>
      <motion.div
        aria-hidden
        className={cn('absolute inset-0', backdrop === 'blur' && 'bg-overlay backdrop-blur-[20px]')}
        {...fade}
        transition={tBase}
        onClick={() => close.current()}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          'relative max-h-[calc(100dvh-40px)] w-full overflow-y-auto overscroll-contain rounded-t-[20px] border border-line bg-canvas shadow-focus outline-none md:max-w-[480px] md:rounded-focus',
          backdrop === 'clear' && 'shadow-[0_-8px_32px_rgb(0_0_0/0.06)]',
          className,
        )}
        {...motionProps}
        transition={tSlow}
        drag={wide || reduce ? false : 'y'}
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 90 || info.velocity.y > 500) close.current()
        }}
      >
        {!wide && (
          <div onPointerDown={(e) => drag.start(e)} className="flex cursor-grab touch-none justify-center pt-2.5 pb-1">
            <div className="h-[5px] w-9 rounded-pill bg-line-strong" />
          </div>
        )}
        <div className="px-6 pt-4 pb-[calc(24px+env(safe-area-inset-bottom))] md:p-8">{children}</div>
      </motion.div>
    </div>
  )
}

export function SheetHeader({ eyebrow, title, detail }: { eyebrow?: ReactNode; title: ReactNode; detail?: ReactNode }) {
  return (
    <div className="mb-6">
      {eyebrow && <div className="mb-2">{eyebrow}</div>}
      <h2 className="text-headline font-semibold text-ink text-balance">{title}</h2>
      {detail && <p className="mt-1.5 text-caption text-ink-2 text-pretty">{detail}</p>}
    </div>
  )
}
