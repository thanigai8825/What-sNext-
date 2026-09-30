import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { CalendarDays, ChevronLeft, Plus, Sparkles, X } from 'lucide-react'
import { analyzeProfileWithAI, refineTasks } from '../../ai/brain'
import { KnowledgeImport, useProfilePreview } from '../../components/KnowledgeImport'
import { ProfileSummary, withoutRemoved } from '../../components/ProfileSummary'
import { WelcomeDemo } from '../../components/WelcomeDemo'
import { Button, IconButton, LineField, MicroLabel, Pill, ProgressDots } from '../../design'
import { analyzeProfile, groupSteps, parseProfile, type ProfileAnalysis } from '../../engine/kb'
import { parseGoalInput, parseTaskLine, splitLines, type ParsedTask } from '../../engine/parse'
import { dateLabel, dayKey, dueLabel, effortLabel } from '../../engine/time'
import { cn } from '../../lib/cn'
import { hash, uid } from '../../lib/id'
import { ease, spring, springPop, tBase, tSlow } from '../../lib/motion'
import { emptyPlan, rankState, useApp, type OnboardingDraft, type PlanDraft, type PlanGoal } from '../../store/app'
import { useUI } from '../../store/ui'

const STEPS = 3

/** Claude's refinement of the parsed tasks, awaited (briefly) by the reveal. */
let pendingRefine: Promise<unknown> | null = null

export function Onboarding() {
  const step = useApp((s) => s.onboarding.step)
  const kbStage = useApp((s) => s.onboarding.kbStage)
  const createdIds = useApp((s) => s.onboarding.createdIds)
  const kbRaw = useApp((s) => s.onboarding.kbRaw)
  const setDraft = useApp((s) => s.setOnboarding)
  const [dir, setDir] = useState(1)
  useProfileAI(kbRaw)

  const go = (next: number, stage?: OnboardingDraft['kbStage']) => {
    setDir(next > step || (next === step && stage === 'review') ? 1 : -1)
    setDraft(stage ? { step: next, kbStage: stage } : { step: next })
    window.scrollTo({ top: 0 })
  }
  const back = () => (step === 1 && kbStage === 'review' ? go(1, 'import') : go(step - 1))
  const skipAI = () => {
    if (!useApp.getState().kb) useApp.getState().skipKB()
    go(2)
  }

  const revealing = !!createdIds?.length
  const screen = step === 1 ? `1-${kbStage}` : revealing ? 'reveal' : String(step)

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="mx-auto flex h-16 w-full max-w-[560px] items-center px-4 md:mt-6">
        <div className="w-24">
          <AnimatePresence>
            {step > 0 && !revealing && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <IconButton icon={ChevronLeft} label="Back" onClick={back} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex flex-1 justify-center">
          <ProgressDots count={STEPS} index={step} />
        </div>
        <div className="flex w-24 justify-end">
          <AnimatePresence>
            {step === 1 && kbStage === 'import' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="-mr-3">
                <Button variant="text" className="text-caption" onClick={skipAI}>
                  Skip
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>
      <main className="relative mx-auto flex w-full max-w-[560px] flex-1 flex-col px-6 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={screen}
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
            {screen === '0' && <Welcome onNext={() => go(1)} />}
            {screen === '1-import' && <ConnectAI onContinue={() => go(1, 'review')} />}
            {screen === '1-review' && <Learned onConfirm={() => go(2)} onReplace={() => go(1, 'import')} />}
            {screen === '2' && <Plan />}
            {screen === 'reveal' && <Reveal ids={createdIds!} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

function StepTitle({ title, detail, eyebrow }: { title: ReactNode; detail?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="pt-6 md:pt-10">
      {eyebrow && <div className="mb-4">{eyebrow}</div>}
      <h1 className="text-display font-semibold text-ink text-balance" aria-live="polite">
        {title}
      </h1>
      {detail && <p className="mt-3 text-body text-ink-2 text-pretty">{detail}</p>}
    </div>
  )
}

/** Primary action: bottom of the screen on mobile, inline on desktop. */
function Footer({ children }: { children: ReactNode }) {
  return <div className="mt-auto pt-10 md:mt-10">{children}</div>
}

// ── The profile, as the app reads it ────────────────────────────────────────

/** Ask Claude to read the pasted answer in the background, once per answer. */
function useProfileAI(raw: string) {
  const aiEnabled = useUI((s) => s.aiEnabled)
  useEffect(() => {
    if (!aiEnabled || !parseProfile(raw).length) return
    const key = hash(raw)
    if (useApp.getState().onboarding.kbAIFor === key) return
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      const result = await analyzeProfileWithAI(raw, ctrl.signal)
      if (result && !ctrl.signal.aborted) useApp.getState().setOnboarding({ kbAI: result, kbAIFor: key })
    }, 400)
    return () => {
      window.clearTimeout(t)
      ctrl.abort()
    }
  }, [raw, aiEnabled])
}

/** Local reading, sharpened by Claude's where it has something to say. */
function useAnalysis(): ProfileAnalysis | null {
  const raw = useApp((s) => s.onboarding.kbRaw)
  const ai = useApp((s) => s.onboarding.kbAI)
  const aiFor = useApp((s) => s.onboarding.kbAIFor)
  return useMemo(() => {
    const fields = parseProfile(raw)
    if (!fields.length) return null
    const local = analyzeProfile(fields, new Date())
    if (!ai || aiFor !== hash(raw)) return local
    const pick = (a: string[], b: string[]) => (a.length ? a : b)
    return {
      goals: ai.goals.length ? ai.goals : local.goals,
      nextSteps: ai.nextSteps.length ? ai.nextSteps : local.nextSteps,
      stepGoals: ai.nextSteps.length ? ai.stepGoals : undefined,
      signals: {
        highValue: pick(ai.signals.highValue, local.signals.highValue),
        avoid: pick(ai.signals.avoid, local.signals.avoid),
        busywork: pick(ai.signals.busywork, local.signals.busywork),
        peak: ai.signals.peak ?? local.signals.peak,
      },
    }
  }, [raw, ai, aiFor])
}

// ── 1. Welcome: the problem, the fix, the outcome ───────────────────────────

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col md:justify-center md:pb-16">
      <div className="flex flex-1 flex-col justify-center pb-6 md:flex-none">
        <h1 className="text-display font-semibold">
          <motion.span className="block text-ink-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...tSlow, delay: 0.1 }}>
            You have big goals.
          </motion.span>
          <motion.span className="block text-ink" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...tSlow, delay: 0.3 }}>
            But small stuff fills your day.
          </motion.span>
        </h1>
        <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...tSlow, delay: 0.5 }}>
          <WelcomeDemo className="mt-8" />
        </motion.div>
        <motion.p className="mt-8 text-body text-ink-2 text-pretty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...tSlow, delay: 0.7 }}>
          Easy tasks feel good, so the important ones wait. What’s Next shows you the one task that moves you forward, and why. So every day ends with
          real progress.
        </motion.p>
      </div>
      <motion.div className="md:mt-10" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...tSlow, delay: 0.85 }}>
        <Button full onClick={onNext} data-autofocus>
          Get started
        </Button>
        <p className="mt-3 text-center text-caption text-ink-3">Takes about two minutes.</p>
      </motion.div>
    </div>
  )
}

// ── 2. Connect your AI ───────────────────────────────────────────────────────

function ConnectAI({ onContinue }: { onContinue: () => void }) {
  const raw = useApp((s) => s.onboarding.kbRaw)
  const setDraft = useApp((s) => s.setOnboarding)
  const preview = useProfilePreview(raw)
  return (
    <>
      <StepTitle
        eyebrow={
          <Pill tone="lavender" icon={Sparkles}>
            Recommended · 2 minutes
          </Pill>
        }
        title="Let your AI set this up for you."
        detail="ChatGPT, Claude and Gemini already know your goals and habits. Paste one answer from them, and we’ll fill in your goals and next steps, and rank your tasks around your real life."
      />
      <div className="mt-10">
        <KnowledgeImport raw={raw} onRaw={(r) => setDraft({ kbRaw: r, removed: [] })} preview={preview} />
      </div>
      <Footer>
        <Button full disabled={preview.state !== 'ok'} onClick={onContinue}>
          Continue
        </Button>
      </Footer>
    </>
  )
}

function Learned({ onConfirm, onReplace }: { onConfirm: () => void; onReplace: () => void }) {
  const raw = useApp((s) => s.onboarding.kbRaw)
  const removed = useApp((s) => s.onboarding.removed)
  const setDraft = useApp((s) => s.setOnboarding)
  const analysis = useAnalysis()

  // Nothing to review (e.g. came back after clearing the answer).
  useEffect(() => {
    if (!analysis) onReplace()
  }, [analysis, onReplace])
  if (!analysis) return null

  const toggle = (key: string) => setDraft({ removed: removed.includes(key) ? removed.filter((k) => k !== key) : [...removed, key] })
  const confirm = () => {
    const fields = parseProfile(raw).map((f) => ({ ...f, confirmed: true }))
    useApp.getState().setKB(raw, fields, withoutRemoved(analysis.signals, removed))
    onConfirm()
  }
  const g = analysis.goals.length
  const s = analysis.nextSteps.length
  const next = [g ? `${g} ${g === 1 ? 'goal' : 'goals'}` : '', s ? `${s} next ${s === 1 ? 'step' : 'steps'}` : ''].filter(Boolean).join(' and ')

  return (
    <>
      <StepTitle title="Here’s what we learned." detail="This is how we’ll rank your tasks. Tap anything that isn’t right to remove it." />
      <div className="mt-10">
        <ProfileSummary signals={analysis.signals} removed={removed} onToggle={toggle} />
        {next && (
          <p className="mt-4 flex items-start gap-2 text-caption text-ink-2">
            <Sparkles size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-lavender" aria-hidden />
            Next, you’ll see your {next}, already filled in.
          </p>
        )}
      </div>
      <Footer>
        <Button full onClick={confirm}>
          Looks right
        </Button>
        <div className="mt-2 flex justify-center">
          <Button variant="text" onClick={onReplace}>
            Paste a different answer
          </Button>
        </div>
      </Footer>
    </>
  )
}

// ── 3. Goals and their steps, on one screen ─────────────────────────────────

const GOAL_IDEAS = ['Get a better job', 'Grow my business', 'Get healthier', 'Learn a new skill']
const MAX_GOALS = 3

function planFrom(a: ProfileAnalysis): Omit<PlanDraft, 'source'> {
  const goals: PlanGoal[] = a.goals.slice(0, MAX_GOALS).map((g) => ({ id: uid(), text: g.title, deadline: g.deadline, steps: [] }))
  const assigned: Array<[string, number | null]> =
    a.stepGoals && a.stepGoals.length === a.nextSteps.length
      ? a.nextSteps.map((s, i) => [s, a.stepGoals![i]])
      : (() => {
          const { byGoal, other } = groupSteps(a.nextSteps, a.goals)
          return [...byGoal.flatMap((steps, gi) => steps.map((s): [string, number] => [s, gi])), ...other.map((s): [string, null] => [s, null])]
        })()
  const other: string[] = []
  for (const [step, gi] of assigned) {
    if (gi !== null && goals[gi] && goals[gi].steps.length < 4) goals[gi].steps.push(step)
    else other.push(step)
  }
  if (!goals.length) goals.push({ id: uid(), text: '', steps: [] })
  return { goals, other: other.slice(0, 6) }
}

function Plan() {
  const plan = useApp((s) => s.onboarding.plan)
  const kb = useApp((s) => s.kb)
  const raw = useApp((s) => s.onboarding.kbRaw)
  const editPlan = useApp((s) => s.editPlan)
  const analysis = useAnalysis()
  const fromProfile = !!kb && kb.raw === raw && !!analysis

  // Fill the plan from the confirmed profile, unless the person has made it their own.
  useEffect(() => {
    const { plan: current } = useApp.getState().onboarding
    if (current.source === 'user') return
    if (fromProfile && analysis && (analysis.goals.length || analysis.nextSteps.length)) {
      useApp.getState().setOnboarding({ plan: { ...planFrom(analysis), source: 'profile', fromAI: true } })
    } else if (!fromProfile && current.source === 'profile') {
      useApp.getState().setOnboarding({ plan: emptyPlan() })
    }
  }, [fromProfile, analysis])

  const hasTask = plan.goals.some((g) => g.steps.some((s) => s.trim())) || plan.other.some((s) => s.trim())
  const hasGoal = plan.goals.some((g) => g.text.trim())

  const setGoal = (id: string, patch: Partial<PlanGoal>) => editPlan((p) => ({ ...p, goals: p.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }))
  const addGoal = () => {
    const id = uid()
    flushSync(() => editPlan((p) => ({ ...p, goals: [...p.goals, { id, text: '', steps: [] }] })))
    document.getElementById(`goal-${id}`)?.focus()
  }
  const removeGoal = (id: string) => editPlan((p) => ({ ...p, goals: p.goals.filter((g) => g.id !== id) }))

  return (
    <>
      <StepTitle
        title="What are you working toward?"
        detail="A goal is something you want to achieve. Steps are the tasks that get you there. We’ll always show you the step that matters most."
      />
      <AnimatePresence initial={false}>
        {plan.fromAI && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 overflow-hidden pt-4 text-caption text-lavender"
          >
            <Sparkles size={14} strokeWidth={1.75} aria-hidden />
            Filled in from your AI. Change anything you like.
          </motion.p>
        )}
      </AnimatePresence>

      <LayoutGroup>
        <div className="mt-8 space-y-3">
          <AnimatePresence initial={false}>
            {plan.goals.map((g, i) => (
              <motion.div
                key={g.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, transition: { ...tBase, delay: i * 0.05 } }}
                exit={{ opacity: 0, scale: 0.98, transition: tBase }}
                transition={spring}
              >
                <GoalBlock
                  goal={g}
                  index={i}
                  showIdeas={i === 0 && plan.source === 'empty' && !g.text.trim()}
                  onChange={(patch) => setGoal(g.id, patch)}
                  onRemove={plan.goals.length > 1 ? () => removeGoal(g.id) : undefined}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {plan.goals.length < MAX_GOALS && (
            <motion.div layout transition={spring}>
              <Button variant="text" icon={Plus} className="-ml-3" onClick={addGoal}>
                Add another goal
              </Button>
            </motion.div>
          )}

          <motion.section layout transition={spring} className="rounded-card bg-surface px-4 pt-4 pb-2" aria-label="Other tasks">
            <MicroLabel as="h2">Anything else on your plate?</MicroLabel>
            <p className="mt-1 text-caption text-ink-3">Things that aren’t part of a goal, like paying a bill.</p>
            <StepRows
              idPrefix="other"
              items={plan.other}
              placeholder="Add a task"
              onChange={(other) => editPlan((p) => ({ ...p, other }))}
              className="mt-2"
            />
          </motion.section>
        </div>
      </LayoutGroup>

      <Footer>
        <SubmitPlan disabled={!hasTask} />
        <p className="mt-3 h-[18px] text-center text-caption text-ink-3" aria-live="polite">
          {!hasTask ? (hasGoal ? 'Add a step to continue.' : 'Add a goal and a first step.') : ''}
        </p>
      </Footer>
    </>
  )
}

function GoalBlock({
  goal,
  index,
  showIdeas,
  onChange,
  onRemove,
}: {
  goal: PlanGoal
  index: number
  showIdeas: boolean
  onChange: (patch: Partial<PlanGoal>) => void
  onRemove?: () => void
}) {
  const now = useMemo(() => new Date(), [])
  const parsed = useMemo(() => parseGoalInput(goal.text, now), [goal.text, now])
  const deadline = goal.deadline !== undefined ? goal.deadline : parsed.deadline

  const setText = (text: string) => {
    // A date typed into the goal wins over one picked earlier; "no deadline" sticks.
    const typed = parseGoalInput(text, now).deadline
    onChange({ text, deadline: goal.deadline === null ? null : typed ? undefined : goal.deadline })
  }

  return (
    <section className="rounded-card bg-surface px-4 pt-4 pb-2" aria-label={`Goal ${index + 1}`}>
      <div className="flex h-5 items-center justify-between">
        <MicroLabel as="h2">Goal {index + 1}</MicroLabel>
        {onRemove && <IconButton icon={X} size={16} label={`Remove goal ${index + 1}`} onClick={onRemove} className="-mr-2.5 size-9" />}
      </div>
      <div className="-mx-2 mt-1 rounded-inner px-2 py-2.5 transition-colors duration-200 focus-within:bg-canvas">
        <LineField
          id={`goal-${goal.id}`}
          value={goal.text}
          onValue={setText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') document.getElementById(`${goal.id}-0`)?.focus()
          }}
          placeholder="e.g. Get a better job"
          aria-label={`Goal ${index + 1}`}
          enterKeyHint="next"
          className="text-headline font-semibold text-ink placeholder:font-normal placeholder:text-faint"
        />
      </div>

      <AnimatePresence initial={false}>
        {showIdeas && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={tBase} className="overflow-hidden">
            <div className="flex flex-wrap gap-2 pt-1 pb-2">
              {GOAL_IDEAS.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => {
                    onChange({ text: idea })
                    document.getElementById(`${goal.id}-0`)?.focus()
                  }}
                  className="h-8 rounded-pill bg-canvas px-3 text-caption text-ink-2 transition-colors hover:text-ink"
                >
                  {idea}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(goal.text.trim() || deadline) && <DeadlineChip deadline={deadline} onChange={(d) => onChange({ deadline: d })} />}

      <div className="mt-2 border-t border-line pt-1">
        <StepRows idPrefix={goal.id} items={goal.steps} placeholder={goal.steps.length ? 'Add another step' : 'Add a first step'} onChange={(steps) => onChange({ steps })} />
      </div>
    </section>
  )
}

function DeadlineChip({ deadline, onChange }: { deadline: string | null; onChange: (d: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const label = deadline ? dateLabel(deadline, new Date(), true) : ''
  const open = () => {
    try {
      ref.current?.showPicker()
    } catch {
      ref.current?.focus()
    }
  }
  return (
    <div className="relative flex h-9 items-center">
      <AnimatePresence mode="wait" initial={false}>
        {deadline ? (
          <motion.span key="due" className="inline-flex items-center" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={springPop}>
            <button type="button" onClick={open} className="rounded-pill" aria-label={`Deadline: by ${label}. Change`}>
              <Pill tone="sand" icon={CalendarDays}>
                By {label}
              </Pill>
            </button>
            <IconButton icon={X} size={14} label="Remove deadline" onClick={() => onChange(null)} className="size-8" />
          </motion.span>
        ) : (
          <motion.button
            key="add"
            type="button"
            onClick={open}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-8 text-caption text-ink-3 transition-colors hover:text-ink"
          >
            Add a deadline (optional)
          </motion.button>
        )}
      </AnimatePresence>
      <input
        ref={ref}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 h-8 w-24 opacity-0"
        min={dayKey(new Date())}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  )
}

/**
 * One field per task, like a checklist: type, press Enter, keep going.
 * A quiet empty row at the end is always ready for the next one.
 */
function StepRows({
  idPrefix,
  items,
  placeholder,
  onChange,
  className,
}: {
  idPrefix: string
  items: string[]
  placeholder: string
  onChange: (items: string[]) => void
  className?: string
}) {
  const rows = [...items, '']
  // Focus moves within the same key press, so fast typing never lands in the row being left.
  const focusRow = (i: number) => {
    const el = document.getElementById(`${idPrefix}-${i}`) as HTMLTextAreaElement | null
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }

  const set = (i: number, value: string) => {
    if (i === items.length) {
      if (value) onChange([...items, value])
      return
    }
    onChange(items.map((v, j) => (j === i ? value : v)))
  }

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLTextAreaElement>) => {
    const value = rows[i]
    if (e.key === 'Enter') {
      if (!value.trim()) return
      if (i >= items.length - 1) focusRow(items.length)
      else {
        flushSync(() => onChange([...items.slice(0, i + 1), '', ...items.slice(i + 1)]))
        focusRow(i + 1)
      }
    } else if (e.key === 'Backspace' && !value && i > 0) {
      e.preventDefault()
      if (i < items.length) onChange(items.filter((_, j) => j !== i))
      focusRow(i - 1)
    } else if (e.key === 'ArrowDown' && i < items.length && atEdge(e.currentTarget, 'end')) {
      e.preventDefault()
      focusRow(i + 1)
    } else if (e.key === 'ArrowUp' && i > 0 && atEdge(e.currentTarget, 'start')) {
      e.preventDefault()
      focusRow(i - 1)
    }
  }

  // Pasting a list fills one row per line.
  const onPaste = (i: number, e: ClipboardEvent<HTMLTextAreaElement>) => {
    const lines = splitLines(e.clipboardData.getData('text'))
    if (lines.length < 2) return
    e.preventDefault()
    const current = rows[i]
    const head = items.slice(0, i)
    const tail = items.slice(i + 1)
    const inserted = current.trim() ? [current, ...lines] : lines
    flushSync(() => onChange([...head, ...inserted, ...tail]))
    focusRow(head.length + inserted.length)
  }

  return (
    <ul className={className}>
      {rows.map((value, i) => {
        const ghost = i === items.length
        return (
          <li key={`${idPrefix}-${i}`} className="-mx-2 flex items-start gap-3 rounded-inner px-2 py-[11px] transition-colors duration-200 focus-within:bg-canvas">
            {ghost ? (
              <Plus size={16} strokeWidth={1.75} className="mt-[3px] w-[18px] shrink-0 text-faint" aria-hidden />
            ) : (
              <span aria-hidden className="mt-0.5 size-[18px] shrink-0 rounded-pill border-[1.5px] border-line-strong" />
            )}
            <div className="min-w-0 flex-1">
              <LineField
                id={`${idPrefix}-${i}`}
                value={value}
                onValue={(v) => set(i, v)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onPaste={(e) => onPaste(i, e)}
                placeholder={ghost ? placeholder : ''}
                aria-label={ghost ? placeholder : `Task ${i + 1}`}
                aria-describedby={ghost ? undefined : `${idPrefix}-${i}-meta`}
                enterKeyHint="next"
                className="text-body text-ink placeholder:text-faint"
              />
              {!ghost && <RowMeta id={`${idPrefix}-${i}-meta`} text={value} />}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Arrow keys leave a wrapped row only from its first or last line. */
function atEdge(el: HTMLTextAreaElement, edge: 'start' | 'end') {
  if (el.selectionStart !== el.selectionEnd) return false
  if (el.scrollHeight < parseFloat(getComputedStyle(el).lineHeight) * 1.5) return true
  return edge === 'end' ? el.selectionEnd === el.value.length : el.selectionStart === 0
}

/** Shows what we picked up from the words — "Fri · 1 hr" — so nothing needs a form. */
function RowMeta({ id, text }: { id: string; text: string }) {
  const meta = useMemo(() => {
    if (!text.trim()) return ''
    const p = parseTaskLine(text, { now: new Date(), goals: [] })
    return [p.due ? dueLabel(p.due, p.dueHasTime, new Date()) : null, p.effortGuessed ? null : effortLabel(p.effort)].filter(Boolean).join(' · ')
  }, [text])
  return (
    <AnimatePresence initial={false}>
      {meta && (
        <motion.p
          id={id}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={tBase}
          className="overflow-hidden text-caption text-ink-3"
        >
          {meta}
        </motion.p>
      )}
    </AnimatePresence>
  )
}

function SubmitPlan({ disabled }: { disabled: boolean }) {
  const submit = () => {
    const now = new Date()
    const app = useApp.getState()
    const { plan } = app.onboarding
    const dayEndHour = app.settings.dayEndHour

    const goalsIn = plan.goals.map((g, i) => {
      const parsed = parseGoalInput(g.text, now)
      return { i, title: parsed.title || g.text.trim(), deadline: g.deadline !== undefined ? g.deadline : parsed.deadline }
    })
    const kept = goalsIn.filter((g) => g.title)
    app.setGoalsFromOnboarding(kept.map(({ title, deadline }) => ({ title, deadline })))
    const created = useApp.getState().goals
    const goalIdFor = new Map(kept.map((g, j) => [g.i, created[j]?.id]))

    const parsed: ParsedTask[] = []
    const lines: string[] = []
    const locked: boolean[] = []
    plan.goals.forEach((g, i) => {
      const goalId = goalIdFor.get(i)
      for (const step of g.steps.filter((s) => s.trim())) {
        const t = parseTaskLine(step, { now, goals: created, dayEndHour })
        parsed.push(goalId ? { ...t, goalId } : t)
        lines.push(step)
        locked.push(!!goalId)
      }
    })
    for (const step of plan.other.filter((s) => s.trim())) {
      parsed.push(parseTaskLine(step, { now, goals: created, dayEndHour }))
      lines.push(step)
      locked.push(false)
    }

    const ids = app.addParsedTasks(parsed)
    // A step written under a goal belongs to that goal; the model shouldn't move it.
    ids.forEach((id, k) => locked[k] && app.updateTask(id, {}, ['goalId']))
    pendingRefine = useUI.getState().aiEnabled ? refineTasks(ids, lines) : null
    app.setOnboarding({ createdIds: ids })
    window.scrollTo({ top: 0 })
  }
  return (
    <Button full disabled={disabled} onClick={submit}>
      Show me what’s first
    </Button>
  )
}

// ── The reveal: every task, then the one that matters ───────────────────────

function Reveal({ ids }: { ids: string[] }) {
  const navigate = useNavigate()
  const goals = useApp((s) => s.goals)
  const tasks = useApp((s) => s.tasks)
  const [sorted, setSorted] = useState(false)
  const [chosen, setChosen] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms))
    void (async () => {
      const started = Date.now()
      // Let the model refine while rows land, but never hold the moment hostage.
      await Promise.race([pendingRefine ?? Promise.resolve(), wait(3500)])
      await wait(Math.max(0, 1100 + ids.length * 60 - (Date.now() - started)))
      if (!alive) return
      setSorted(true)
      const top = rankState(useApp.getState()).find((r) => r.bucket === 'now')
      await wait(750)
      if (!alive) return
      setChosen(top?.task.id ?? ids[0])
      await wait(1600)
      if (!alive) return
      const app = useApp.getState()
      app.setCurrent(top?.task.id ?? null)
      app.finishOnboarding()
      pendingRefine = null
      navigate('/', { replace: true })
    })()
    return () => {
      alive = false
    }
  }, [ids, navigate])

  const rows = useMemo(() => {
    const list = ids.map((id) => tasks.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t)
    if (!sorted) return list
    const order = rankState(useApp.getState()).map((r) => r.task.id)
    return [...list].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
  }, [ids, tasks, sorted])

  return (
    <>
      <StepTitle
        title={chosen ? 'Here’s what matters most.' : 'Finding what matters most…'}
        detail={chosen ? 'One task at a time, with the reason. That’s how What’s Next works.' : undefined}
      />
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
                className={cn('relative rounded-card px-4 py-3.5 transition-colors duration-500', isChosen ? 'z-10 bg-surface shadow-focus' : 'bg-canvas')}
              >
                <p className={cn('text-body', isChosen ? 'font-semibold text-ink' : 'text-ink')}>{t.title}</p>
                <p className="mt-0.5 flex text-caption text-ink-2">
                  {goal && <span className="truncate">{goal.title}</span>}
                  <span className="shrink-0 whitespace-pre">{goal ? ` · ${meta}` : meta}</span>
                </p>
              </motion.li>
            )
          })}
        </ul>
      </LayoutGroup>
    </>
  )
}
