import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft } from 'lucide-react'
import { refineProfile } from '../ai/brain'
import { KnowledgeImport } from '../components/KnowledgeImport'
import { ProfileCards } from '../components/ProfileCards'
import { Button, LargeTitle, MicroLabel, Page } from '../design'
import { observedPeak, peakName } from '../engine/insights'
import type { KBField } from '../engine/types'
import { tBase } from '../lib/motion'
import { useApp } from '../store/app'
import { withUndo } from '../store/ui'

export function KnowledgeScreen() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const kb = useApp((s) => s.kb)
  const ratings = useApp((s) => s.ratings)
  const [draft, setDraft] = useState<{ raw: string; fields: KBField[] } | null>(null)
  const importing = params.get('import') === '1' || !kb
  const app = useApp.getState()

  const saveDraft = () => {
    if (!draft) return
    withUndo('Knowledge base saved', () => useApp.getState().setKB(draft.raw, draft.fields.map((f) => ({ ...f, confirmed: true }))))
    void refineProfile()
    setDraft(null)
    setParams({}, { replace: true })
  }

  // Observed behavior gradually overrides what was imported; say so when it happens.
  const claimed = peakName(kb?.signals.peak ?? null)
  const observed = observedPeak(ratings)
  const learned: string[] = []
  if (claimed && observed && claimed !== observed) learned.push(`You said you focus best in the ${claimed}. Lately your best work happens in the ${observed}, so picks follow that.`)
  if (claimed && observed && claimed === observed) learned.push(`You said you focus best in the ${claimed}. Your ratings agree.`)
  if (ratings.length >= 8) learned.push('Your ratings now carry more weight than this profile.')

  return (
    <Page>
      <Button variant="text" icon={ChevronLeft} className="-ml-3 -mt-6 mb-4 md:-mt-10" onClick={() => navigate('/settings')}>
        Settings
      </Button>
      <LargeTitle>Knowledge base</LargeTitle>

      <AnimatePresence mode="wait" initial={false}>
        {draft ? (
          <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tBase}>
            <p className="-mt-6 mb-8 text-body text-ink-2">Confirm, edit or remove anything before saving.</p>
            <ProfileCards
              fields={draft.fields}
              onConfirm={(k) => setDraft({ ...draft, fields: draft.fields.map((f) => (f.key === k ? { ...f, confirmed: true } : f)) })}
              onEdit={(k, v) => setDraft({ ...draft, fields: draft.fields.map((f) => (f.key === k ? { ...f, value: v, confirmed: true } : f)).filter((f) => f.value) })}
              onDelete={(k) => setDraft({ ...draft, fields: draft.fields.filter((f) => f.key !== k) })}
            />
            <Button full className="mt-8" onClick={saveDraft}>
              Looks right
            </Button>
            <div className="mt-2 flex justify-center">
              <Button variant="text" onClick={() => setDraft(null)}>
                Paste again
              </Button>
            </div>
          </motion.div>
        ) : importing ? (
          <motion.div key="import" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tBase}>
            <p className="-mt-6 mb-8 text-body text-ink-2">Ask the AI you already use to describe how you work, then paste its answer. It stays private.</p>
            <KnowledgeImport onImport={(raw, fields) => setDraft({ raw, fields })} />
            {kb && (
              <div className="mt-2 flex justify-center">
                <Button variant="text" onClick={() => setParams({}, { replace: true })}>
                  Keep current profile
                </Button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="view" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={tBase}>
            <p className="-mt-6 mb-8 text-body text-ink-2">Private. Used only for your recommendations.</p>
            <ProfileCards
              fields={kb!.fields}
              onConfirm={(k) => app.updateKBField(k, { confirmed: true })}
              onEdit={(k, v) => (v ? app.updateKBField(k, { value: v, confirmed: true }) : app.removeKBField(k))}
              onDelete={(k) => withUndo('Card removed', () => useApp.getState().removeKBField(k))}
            />
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
              <Button variant="secondary" full onClick={() => setParams({ import: '1' })}>
                Re-import
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
