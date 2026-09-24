import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Button, MicroLabel, Pill, Sheet, SheetHeader } from '../design'
import { rankAt } from '../engine/score'
import { addDays, atHour, dayKey, effortLabel, parseHm } from '../engine/time'
import { tBase } from '../lib/motion'
import { engineInput, useApp } from '../store/app'
import { useUI, withUndo } from '../store/ui'

/**
 * Sheets the app offers on its own — never more than one, never on a busy moment:
 * the end-of-day check ("Tomorrow starts with X") and, once, the knowledge base re-offer.
 */
export function AutoSheets() {
  const { pathname } = useLocation()
  const [which, setWhich] = useState<'evening' | 'kb' | null>(null)

  useEffect(() => {
    if (pathname !== '/') return
    const decide = () => {
      if (useUI.getState().sheets > 0 || useApp.getState().focus) return
      const s = useApp.getState()
      const now = new Date()
      // Give a brand-new person room to breathe before the app asks anything.
      if (s.meta.onboardedAt && now.getTime() - new Date(s.meta.onboardedAt).getTime() < 2 * 3_600_000) return
      const today = dayKey(now)
      const minutes = now.getHours() * 60 + now.getMinutes()
      const open = s.tasks.some((t) => t.status === 'open')
      if (s.settings.eveningEnabled && open && s.meta.lastEveningCheck !== today && minutes >= parseHm(s.settings.eveningTime) && now.getHours() < 24) {
        setWhich('evening')
        return
      }
      if (!s.kb && s.meta.kbSkippedAt && !s.meta.kbReoffered) {
        const since = dayKey(new Date(s.meta.kbSkippedAt))
        const daysUsed = s.meta.activeDays.filter((d) => d > since).length
        if (daysUsed >= 3) setWhich('kb')
      }
    }
    const t = window.setTimeout(decide, 1400)
    const i = window.setInterval(decide, 5 * 60_000)
    return () => {
      window.clearTimeout(t)
      window.clearInterval(i)
    }
  }, [pathname])

  return (
    <>
      <EveningCheck open={which === 'evening'} onClose={() => setWhich(null)} />
      <KBReoffer open={which === 'kb'} onClose={() => setWhich(null)} />
    </>
  )
}

/** Investment that sets up tomorrow's trigger. Ten seconds, one question. */
export function EveningCheck({ open, onClose, day }: { open: boolean; onClose: () => void; day?: Date }) {
  const [choosing, setChoosing] = useState(false)
  const target = useMemo(() => day ?? addDays(new Date(), 1), [day])
  const key = dayKey(target)
  const candidates = useMemo(() => {
    if (!open) return []
    const s = useApp.getState()
    return rankAt(engineInput(s), atHour(target, 9))
      .filter((r) => r.bucket !== 'skip' && r.available)
      .slice(0, 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key])
  const first = candidates[0]
  const label = day ? (target.getDay() === 1 ? 'Monday' : 'Next week') : 'Tomorrow'

  const close = () => {
    useApp.getState().markEveningChecked()
    setChoosing(false)
    onClose()
  }
  const pick = (id: string) => {
    withUndo(`Set. ${label} starts with a clear first step.`, () => {
      useApp.getState().setPlan(key, id)
      useApp.getState().markEveningChecked()
    })
    setChoosing(false)
    onClose()
  }

  return (
    <Sheet open={open && !!first} onClose={close} label={`${label} starts with`}>
      {first && (
        <>
          <MicroLabel className="mb-3">{label}</MicroLabel>
          <SheetHeader title={<>{label} starts with “{first.task.title}”. Sound right?</>} />
          <AnimatePresence initial={false} mode="wait">
            {choosing ? (
              <motion.ul key="list" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tBase} className="-mx-3">
                {candidates.map((r) => (
                  <li key={r.task.id}>
                    <button
                      type="button"
                      onClick={() => pick(r.task.id)}
                      className="flex h-12 w-full items-center gap-4 rounded-inner px-3 text-left transition-colors hover:bg-surface"
                    >
                      <span className="flex-1 truncate text-body text-ink">{r.task.title}</span>
                      <span className="text-caption text-ink-3">{effortLabel(r.task.effort)}</span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            ) : (
              <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tBase}>
                <Button full data-autofocus onClick={() => pick(first.task.id)}>
                  Sounds right
                </Button>
                <div className="mt-2 flex justify-center">
                  <Button variant="text" onClick={() => setChoosing(true)}>
                    Choose another
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </Sheet>
  )
}

function KBReoffer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const done = () => {
    useApp.getState().markKBReoffered()
    onClose()
  }
  return (
    <Sheet open={open} onClose={done} label="Help What’s Next know you">
      <div className="mb-4">
        <Pill tone="lavender">Optional · 2 minutes</Pill>
      </div>
      <SheetHeader title="Want sharper picks?" detail="Help What’s Next know you. Paste a short profile from the AI you already use. It stays private." />
      <Button
        full
        data-autofocus
        onClick={() => {
          done()
          navigate('/settings/knowledge?import=1')
        }}
      >
        Set it up
      </Button>
      <div className="mt-2 flex justify-center">
        <Button variant="text" onClick={done}>
          Not now
        </Button>
      </div>
    </Sheet>
  )
}
