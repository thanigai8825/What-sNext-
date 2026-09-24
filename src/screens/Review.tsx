import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { EveningCheck } from '../components/AutoSheets'
import { SettingsButton } from '../components/SettingsButton'
import { Button, LargeTitle, MicroLabel, Page, ProgressBar } from '../design'
import { summarizeWeek } from '../engine/insights'
import { addDays, durationLabel } from '../engine/time'
import { plural } from '../engine/text'
import { tBase } from '../lib/motion'
import { useApp } from '../store/app'

function nextMonday(now = new Date()) {
  const d = new Date(now)
  const days = (8 - d.getDay()) % 7 || 7
  return addDays(d, days)
}

export function ReviewScreen() {
  const navigate = useNavigate()
  const tasks = useApp((s) => s.tasks)
  const ratings = useApp((s) => s.ratings)
  const skips = useApp((s) => s.skips)
  const [planning, setPlanning] = useState(false)
  const week = useMemo(() => summarizeWeek(tasks, ratings, skips, new Date()), [tasks, ratings, skips])

  return (
    <Page>
      <LargeTitle accessory={<SettingsButton />}>Your week</LargeTitle>

      {week.doneCount === 0 ? (
        <div className="flex flex-col items-start gap-5">
          <p className="text-body text-ink-2">Your week shows up here after a few finished tasks.</p>
          <Button variant="secondary" onClick={() => navigate('/')}>
            See what’s first
          </Button>
        </div>
      ) : (
        <>
          <section aria-label="High-value work">
            <motion.p className="text-display font-semibold text-ink tabular" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={tBase}>
              {week.highValueShare}%
            </motion.p>
            <p className="mt-1 text-headline text-ink-2">of your time went to high-value work</p>
            <ProgressBar value={week.highValueShare} from={0} delay={0.2} className="mt-6" label="High-value share" />
            <p className="mt-3 text-caption text-ink-3">
              {plural(week.doneCount, 'task')} finished · {durationLabel(week.minutes * 60_000)} of work
            </p>
          </section>

          {week.insights.length > 0 && (
            <section className="mt-12" aria-labelledby="patterns">
              <MicroLabel as="h2" className="mb-3">
                <span id="patterns">Patterns</span>
              </MicroLabel>
              <ul className="space-y-3">
                {week.insights.map((i, n) => (
                  <motion.li
                    key={i.kind}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { ...tBase, delay: 0.15 + n * 0.06 } }}
                    className="rounded-card bg-sky-bg px-4 py-3.5 text-body text-sky"
                  >
                    {i.text}
                  </motion.li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-12" aria-labelledby="next-week">
            <MicroLabel as="h2" className="mb-2">
              <span id="next-week">Next week</span>
            </MicroLabel>
            <p className="text-body text-ink text-pretty">{week.suggestion}</p>
            <Button full className="mt-6" onClick={() => setPlanning(true)}>
              Plan next week
            </Button>
          </section>
        </>
      )}
      <EveningCheck open={planning} onClose={() => setPlanning(false)} day={nextMonday()} />
    </Page>
  )
}
