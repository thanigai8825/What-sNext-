import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { CalendarDays, ChevronLeft, Plus, X } from 'lucide-react'
import { refineProfile, refineTasks } from '../../ai/brain'
import { KnowledgeImport } from '../../components/KnowledgeImport'
import { Mark } from '../../components/Nav'
import { ProfileCards } from '../../components/ProfileCards'
import { Button, IconButton, Input, MicroLabel, Pill, ProgressDots, TextArea } from '../../design'
import { parseGoalInput, parseTaskList, splitLines } from '../../engine/parse'
import { dateLabel, dayKey, dueLabel, effortLabel } from '../../engine/time'
import type { KBField } from '../../engine/types'
import { cn } from '../../lib/cn'
import { ease, spring, springPop, tBase, tSlow } from '../../lib/motion'
import { rankState, useApp } from '../../store/app'
import { useUI } from '../../store/ui'

const STEPS = 4

export function Onboarding() {
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const go = (n: number) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
    window.scrollTo({ top: 0 })
  }
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="mx-auto flex h-16 w-full max-w-[560px] items-center px-4 md:mt-6">
        <div className="w-11">
          <AnimatePresence>
            {step > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <IconButton icon={ChevronLeft} label="Back" onClick={() => go(step - 1)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex flex-1 justify-center">
          <ProgressDots count={STEPS} index={step} />
        </div>
        <div className="w-11" />
      </header>
      <div className="relative mx-auto flex w-full max-w-[560px] flex-1 flex-col px-6 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step}
            custom={dir}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 28 }),
              center: { opacity: 1, x: 0, transition: tSlow },
              exit: (d: number) => ({ opacity: 0, x: d * -20, transition: { duration: 0.18, ease } }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            className="flex flex-1 flex-col"
          >
            {step === 0 && <Welcome onNext={() => go(1)} />}
            {step === 1 && <Goals onNext={() => go(2)} />}
            {step === 2 && <Knowledge onNext={() => go(3)} />}
            {step === 3 && <FirstTasks />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function StepTitle({ title, detail, eyebrow }: { title: ReactNode; detail?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="pt-6 md:pt-12">
      {eyebrow && <div className="mb-4">{eyebrow}</div>}
      <h1 className="text-display font-semibold text-ink text-balance">{title}</h1>
      {detail && <p className="mt-3 text-body text-ink-2 text-pretty">{detail}</p>}
    </div>
  )
}

/** Primary action: bottom of the screen on mobile, inline on desktop. */
function Footer({ children }: { children: ReactNode }) {
  return <div className="mt-auto pt-10 md:mt-10">{children}</div>
}

// ── 1. Welcome ───────────────────────────────────────────────────────────────

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <>
      <div className="flex flex-1 flex-col justify-center pb-8">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...springPop, delay: 0.1 }}>
          <Mark size={44} />
        </motion.div>
        <h1 className="mt-8 text-display font-semibold md:text-[40px] md:leading-[46px]">
          <motion.span className="block text-ink-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...tSlow, delay: 0.2 }}>
            Stop being busy.
          </motion.span>
          <motion.span className="block text-ink" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...tSlow, delay: 0.45 }}>
            Start making progress.
          </motion.span>
        </h1>
        <motion.p className="mt-5 max-w-[420px] text-body text-ink-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...tSlow, delay: 0.75 }}>
          Tell it what matters. It shows you the one thing to do right now, and why.
        </motion.p>
      </div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...tSlow, delay: 0.9 }}>
        <Button full onClick={onNext} data-autofocus>
          Get started
        </Button>
      </motion.div>
    </>
  )
}

// ── 2. Goals ─────────────────────────────────────────────────────────────────

interface GoalDraft {
  text: string
  /** undefined: use what we parsed; null: none; string: YYYY-MM-DD */
  deadline?: string | null
}

const GOAL_EXAMPLES = ['Launch my portfolio by Oct 30', 'Land two new clients', 'Run a half marathon in spring']

function Goals({ onNext }: { onNext: () => void }) {
  const saved = useApp((s) => s.goals)
  const [drafts, setDrafts] = useState<GoalDraft[]>(() =>
    saved.length ? saved.map((g) => ({ text: g.title, deadline: g.deadline })) : [{ text: '' }],
  )
  const now = useMemo(() => new Date(), [])
  const parsed = drafts.map((d) => {
    const p = parseGoalInput(d.text, now)
    return { title: p.title, deadline: d.deadline !== undefined ? d.deadline : p.deadline }
  })
  const valid = parsed.filter((p, i) => drafts[i].text.trim() && p.title)
  const set = (i: number, patch: Partial<GoalDraft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)))

  const submit = () => {
    if (!valid.length) return
    useApp.getState().setGoalsFromOnboarding(valid.map((v) => ({ title: v.title, deadline: v.deadline })))
    onNext()
  }

  return (
    <>
      <StepTitle title="What are you working toward?" detail="Up to three goals. Add a deadline if there is one." />
      <LayoutGroup>
        <div className="mt-10 space-y-5">
          <AnimatePresence initial={false}>
            {drafts.map((d, i) => (
              <motion.div key={i} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                <GoalField
                  index={i}
                  draft={d}
                  deadline={parsed[i].deadline}
                  placeholder={GOAL_EXAMPLES[i]}
                  onText={(text) => set(i, { text, deadline: d.deadline === null ? null : undefined })}
                  onDeadline={(deadline) => set(i, { deadline })}
                  onEnter={() => (i === drafts.length - 1 ? submit() : document.getElementById(`goal-${i + 1}`)?.focus())}
                  onRemove={drafts.length > 1 ? () => setDrafts((ds) => ds.filter((_, j) => j !== i)) : undefined}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          {drafts.length < 3 && drafts[drafts.length - 1].text.trim() && (
            <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={tBase}>
              <Button
                variant="text"
                icon={Plus}
                className="-ml-3"
                onClick={() => {
                  setDrafts((ds) => [...ds, { text: '' }])
                  window.setTimeout(() => document.getElementById(`goal-${drafts.length}`)?.focus(), 50)
                }}
              >
                Add another goal
              </Button>
            </motion.div>
          )}
        </div>
      </LayoutGroup>
      <Footer>
        <Button full disabled={!valid.length} onClick={submit}>
          Continue
        </Button>
      </Footer>
    </>
  )
}

function GoalField({
  index,
  draft,
  deadline,
  placeholder,
  onText,
  onDeadline,
  onEnter,
  onRemove,
}: {
  index: number
  draft: GoalDraft
  deadline: string | null
  placeholder: string
  onText: (t: string) => void
  onDeadline: (d: string | null) => void
  onEnter: () => void
  onRemove?: () => void
}) {
  const dateRef = useRef<HTMLInputElement>(null)
  const openPicker = () => {
    try {
      dateRef.current?.showPicker()
    } catch {
      dateRef.current?.focus()
    }
  }
  return (
    <div>
      <div className="relative">
        <Input
          id={`goal-${index}`}
          data-autofocus={index === 0 ? true : undefined}
          value={draft.text}
          onChange={(e) => onText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onEnter())}
          placeholder={placeholder}
          aria-label={`Goal ${index + 1}`}
          className={onRemove ? 'pr-12' : undefined}
        />
        {onRemove && (
          <IconButton icon={X} label={`Remove goal ${index + 1}`} size={18} onClick={onRemove} className="absolute top-0.5 right-0.5" />
        )}
      </div>
      <div className="relative mt-2 flex h-8 items-center">
        <AnimatePresence mode="wait" initial={false}>
          {deadline ? (
            <motion.span key="due" className="inline-flex items-center gap-1" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={springPop}>
              <button type="button" onClick={openPicker} className="rounded-pill" aria-label={`Deadline ${deadline}. Change`}>
                <Pill tone="sand" icon={CalendarDays}>
                  Due {dateLabel(deadline, new Date())}
                </Pill>
              </button>
              <IconButton icon={X} size={16} label="Remove deadline" onClick={() => onDeadline(null)} className="size-8" />
            </motion.span>
          ) : (
            draft.text.trim() && (
              <motion.span key="add" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button type="button" onClick={openPicker} className="h-8 text-caption text-ink-3 transition-colors hover:text-ink">
                  Add deadline
                </button>
              </motion.span>
            )
          )}
        </AnimatePresence>
        <input
          ref={dateRef}
          type="date"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 h-8 w-24 opacity-0"
          min={dayKey(new Date())}
          onChange={(e) => onDeadline(e.target.value || null)}
        />
      </div>
    </div>
  )
}

// ── 3. Knowledge base ────────────────────────────────────────────────────────

function Knowledge({ onNext }: { onNext: () => void }) {
  const [draft, setDraft] = useState<{ raw: string; fields: KBField[] } | null>(null)
  const existing = useApp((s) => s.kb)

  if (draft) {
    const update = (fields: KBField[]) => setDraft({ ...draft, fields })
    return (
      <>
        <StepTitle title="Here’s what we understood." detail="Confirm, edit or remove anything. Only you can see this." />
        <div className="mt-10">
          <ProfileCards
            fields={draft.fields}
            onConfirm={(k) => update(draft.fields.map((f) => (f.key === k ? { ...f, confirmed: true } : f)))}
            onEdit={(k, v) => update(draft.fields.map((f) => (f.key === k ? { ...f, value: v, confirmed: true } : f)).filter((f) => f.value))}
            onDelete={(k) => update(draft.fields.filter((f) => f.key !== k))}
          />
          <Button variant="text" className="-ml-3 mt-3" onClick={() => setDraft(null)}>
            Paste again
          </Button>
        </div>
        <Footer>
          <Button
            full
            onClick={() => {
              useApp.getState().setKB(draft.raw, draft.fields.map((f) => ({ ...f, confirmed: true })))
              void refineProfile()
              onNext()
            }}
          >
            Looks right
          </Button>
        </Footer>
      </>
    )
  }

  return (
    <>
      <StepTitle
        eyebrow={<Pill tone="lavender">Optional · 2 minutes</Pill>}
        title="Help What’s Next know you."
        detail="Ask the AI you already use to describe how you work, then paste its answer. It stays private and only shapes your picks."
      />
      <div className="mt-10">
        <KnowledgeImport onImport={(raw, fields) => setDraft({ raw, fields })} />
        <div className="mt-2 flex justify-center">
          <Button
            variant="text"
            onClick={() => {
              if (!existing) useApp.getState().skipKB()
              onNext()
            }}
          >
            {existing ? 'Keep my current profile' : 'Skip for now'}
          </Button>
        </div>
      </div>
    </>
  )
}

// ── 4. First tasks ───────────────────────────────────────────────────────────

const TASKS_PLACEHOLDER = `Send proposal to Arun by Friday, 1 hr
Draft case study for portfolio
Clean up inbox
Book dentist appointment`

function FirstTasks() {
  const navigate = useNavigate()
  const goals = useApp((s) => s.goals)
  const dayEndHour = useApp((s) => s.settings.dayEndHour)
  const [text, setText] = useState('')
  const [ids, setIds] = useState<string[] | null>(null)
  const [sorted, setSorted] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)
  const count = splitLines(text).length
  const tasks = useApp((s) => s.tasks)

  const go = async () => {
    const lines = splitLines(text)
    if (!lines.length) return
    const parsed = parseTaskList(text, { now: new Date(), goals, dayEndHour })
    const created = useApp.getState().addParsedTasks(parsed)
    setIds(created)
    const started = Date.now()
    // Let the model refine while rows land, but never hold the moment hostage.
    const refine = useUI.getState().aiEnabled ? Promise.race([refineTasks(created, lines), new Promise((r) => setTimeout(r, 3500))]) : Promise.resolve()
    await refine
    await new Promise((r) => setTimeout(r, Math.max(0, 1100 + created.length * 60 - (Date.now() - started))))
    setSorted(true)
    const top = rankState(useApp.getState()).find((r) => r.bucket === 'now')
    await new Promise((r) => setTimeout(r, 750))
    setChosen(top?.task.id ?? created[0])
    await new Promise((r) => setTimeout(r, 1000))
    const app = useApp.getState()
    app.setCurrent(top?.task.id ?? null)
    app.finishOnboarding()
    navigate('/', { replace: true })
  }

  const rows = useMemo(() => {
    if (!ids) return []
    const list = ids.map((id) => tasks.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t)
    if (!sorted) return list
    const order = rankState(useApp.getState()).map((r) => r.task.id)
    return [...list].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  }, [ids, tasks, sorted])

  if (ids) {
    return (
      <>
        <StepTitle title={chosen ? 'Here’s what matters most.' : 'Finding what matters most…'} />
        <LayoutGroup>
          <ul className="mt-10 space-y-2">
            {rows.map((t, i) => {
              const goal = goals.find((g) => g.id === t.goalId)
              const meta = [effortLabel(t.effort), t.due ? dueLabel(t.due, t.dueHasTime, new Date()) : null].filter(Boolean).join(' · ')
              const isChosen = chosen === t.id
              return (
                <motion.li
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: chosen && !isChosen ? 0.35 : 1, y: 0, scale: isChosen ? 1.02 : 1 }}
                  transition={{ ...spring, opacity: tBase, delay: sorted ? 0 : i * 0.06 }}
                  className={cn('rounded-card px-4 py-3.5 transition-colors duration-500', isChosen ? 'bg-surface shadow-focus' : 'bg-surface/0')}
                >
                  <p className={cn('text-body', isChosen ? 'font-semibold text-ink' : 'text-ink')}>{t.title}</p>
                  <p className="mt-0.5 text-caption text-ink-2">
                    {goal ? `${goal.title} · ` : ''}
                    {meta}
                  </p>
                </motion.li>
              )
            })}
          </ul>
        </LayoutGroup>
      </>
    )
  }

  return (
    <>
      <StepTitle title="What’s on your plate?" detail="Paste a list or type one per line. Deadlines and effort are picked up for you." />
      <div className="mt-10">
        <TextArea data-autofocus minRows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={TASKS_PLACEHOLDER} aria-label="Your tasks" />
        <MicroLabel className="mt-3 h-4">{count ? `${count} ${count === 1 ? 'task' : 'tasks'}` : ''}</MicroLabel>
      </div>
      <Footer>
        <Button full disabled={!count} onClick={go}>
          Show me what’s first
        </Button>
      </Footer>
    </>
  )
}
