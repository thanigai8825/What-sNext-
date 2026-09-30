import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, ChevronLeft } from 'lucide-react'
import { refineProfile } from '../ai/brain'
import { KnowledgeImport, useProfilePreview } from '../components/KnowledgeImport'
import { ProfileCards } from '../components/ProfileCards'
import { ProfileSummary, withoutRemoved } from '../components/ProfileSummary'
import { Button, Collapse, LargeTitle, ListGroup, ListRow, MicroLabel, Page, Toggle } from '../design'
import { observedPeak, peakName } from '../engine/insights'
import { parseTaskLine } from '../engine/parse'
import { tBase } from '../lib/motion'
import { useApp } from '../store/app'
import { withUndo } from '../store/ui'

export function KnowledgeScreen() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const kb = useApp((s) => s.kb)
  const ratings = useApp((s) => s.ratings)
  const tasks = useApp((s) => s.tasks)
  const goals = useApp((s) => s.goals)
  const dayEndHour = useApp((s) => s.settings.dayEndHour)
  const [raw, setRaw] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [removed, setRemoved] = useState<string[]>([])
  const [addSteps, setAddSteps] = useState(true)
  const [details, setDetails] = useState(false)
  const preview = useProfilePreview(raw)
  // The mode lives here so saving switches screens in one render; the URL follows
  // (and Back from ?import=1 still leads home to the saved profile).
  const wantsImport = params.get('import') === '1'
  const [importingNow, setImporting] = useState(wantsImport)
  useEffect(() => setImporting(wantsImport), [wantsImport])
  const importing = importingNow || !kb

  // Next steps that aren't already on the list.
  const newSteps = useMemo(() => {
    if (preview.state !== 'ok') return []
    const open = new Set(tasks.filter((t) => t.status === 'open').map((t) => t.title.toLowerCase()))
    const now = new Date()
    return preview.analysis.nextSteps.map((s) => parseTaskLine(s, { now, goals, dayEndHour })).filter((p) => !open.has(p.title.toLowerCase()))
  }, [preview, tasks, goals, dayEndHour])

  const startImport = () => {
    setImporting(true)
    setParams({ import: '1' })
  }

  const doneImporting = () => {
    setRaw('')
    setRemoved([])
    setReviewing(false)
    setImporting(false)
    setParams({}, { replace: true })
  }

  const save = () => {
    const fields = preview.fields.map((f) => ({ ...f, confirmed: true }))
    const signals = withoutRemoved(preview.analysis.signals, removed)
    const steps = addSteps ? newSteps : []
    const n = steps.length
    withUndo(n ? `Saved, and ${n} ${n === 1 ? 'step' : 'steps'} added to Tasks` : 'Knowledge base saved', () => {
      const app = useApp.getState()
      app.setKB(raw, fields, signals)
      if (n) app.addParsedTasks(steps)
    })
    void refineProfile()
    doneImporting()
  }

  // Observed behavior gradually overrides what was imported; say so when it happens.
  const learned = useMemo(() => {
    const claimed = peakName(kb?.signals.peak ?? null)
    const observed = observedPeak(ratings)
    const out: string[] = []
    if (claimed && observed && claimed !== observed) out.push(`You said you focus best in the ${claimed}. Lately your best work happens in the ${observed}, so picks follow that.`)
    if (claimed && observed && claimed === observed) out.push(`You said you focus best in the ${claimed}. Your ratings agree.`)
    if (ratings.length >= 8) out.push('Your ratings now carry more weight than this profile.')
    return out
  }, [kb, ratings])

  const removeSaved = (key: string) => {
    if (!kb) return
    const signals = withoutRemoved(kb.signals, [key])
    withUndo('Removed', () => useApp.getState().setKBSignals(signals))
  }

  const mode = importing ? (reviewing && preview.state === 'ok' ? 'review' : 'import') : 'view'

  return (
    <Page>
      <Button variant="text" icon={ChevronLeft} className="-mt-6 mb-4 -ml-3 md:-mt-10" onClick={() => navigate('/settings')}>
        Settings
      </Button>
      <LargeTitle>Knowledge base</LargeTitle>

      <AnimatePresence mode="wait" initial={false}>
        {mode === 'review' && (
          <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tBase}>
            <p className="-mt-6 mb-8 text-body text-ink-2">This is how we’ll rank your tasks. Tap anything that isn’t right to remove it.</p>
            <ProfileSummary
              signals={preview.analysis.signals}
              removed={removed}
              onToggle={(k) => setRemoved((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]))}
            />
            {newSteps.length > 0 && (
              <div className="mt-6">
                <ListGroup>
                  <ListRow
                    label={`Add ${newSteps.length} new ${newSteps.length === 1 ? 'step' : 'steps'} to Tasks`}
                    accessory={<Toggle checked={addSteps} onChange={setAddSteps} label="Add next steps to Tasks" />}
                  />
                </ListGroup>
              </div>
            )}
            <Button full className="mt-2" onClick={save}>
              Looks right
            </Button>
            <div className="mt-2 flex justify-center">
              <Button variant="text" onClick={() => setReviewing(false)}>
                Paste a different answer
              </Button>
            </div>
          </motion.div>
        )}

        {mode === 'import' && (
          <motion.div key="import" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tBase}>
            <p className="-mt-6 mb-10 text-body text-ink-2">Paste one answer from ChatGPT, Claude or Gemini, and your picks will fit your real goals and habits.</p>
            <KnowledgeImport raw={raw} onRaw={setRaw} preview={preview} />
            <Button full className="mt-10" disabled={preview.state !== 'ok'} onClick={() => setReviewing(true)}>
              Continue
            </Button>
            {kb && (
              <div className="mt-2 flex justify-center">
                <Button variant="text" onClick={doneImporting}>
                  Keep my current profile
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {mode === 'view' && kb && (
          <motion.div key="view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tBase}>
            <p className="-mt-6 mb-8 text-body text-ink-2">Private. Used only for your recommendations. Tap anything to remove it.</p>
            <ProfileSummary signals={kb.signals} removed={[]} onToggle={removeSaved} />

            <button
              type="button"
              onClick={() => setDetails((d) => !d)}
              aria-expanded={details}
              className="mt-6 flex h-11 items-center gap-1.5 text-body text-ink-2 transition-colors hover:text-ink"
            >
              Everything you shared
              <motion.span animate={{ rotate: details ? 180 : 0 }} transition={tBase} className="inline-flex">
                <ChevronDown size={18} strokeWidth={1.5} aria-hidden />
              </motion.span>
            </button>
            <Collapse open={details}>
              <div className="pt-3">
                <ProfileCards
                  fields={kb.fields}
                  onConfirm={(k) => useApp.getState().updateKBField(k, { confirmed: true })}
                  onEdit={(k, v) => (v ? useApp.getState().updateKBField(k, { value: v, confirmed: true }) : useApp.getState().removeKBField(k))}
                  onDelete={(k) => withUndo('Removed', () => useApp.getState().removeKBField(k))}
                />
              </div>
            </Collapse>

            {learned.length > 0 && (
              <section className="mt-12">
                <MicroLabel as="h2" className="mb-3">
                  Learned from you
                </MicroLabel>
                <ul className="space-y-3">
                  {learned.map((l) => (
                    <li key={l} className="rounded-card bg-lavender-bg px-4 py-3.5 text-body text-lavender">
                      {l}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="mt-12 flex flex-col items-center gap-2">
              <Button variant="secondary" full onClick={startImport}>
                Import a new answer
              </Button>
              <Button variant="text" onClick={() => withUndo('Knowledge base deleted', () => useApp.getState().deleteKB())}>
                Delete knowledge base
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  )
}
