import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { initAI, scheduleRanking } from './ai/brain'
import { AutoSheets } from './components/AutoSheets'
import { Fab } from './components/Fab'
import { Sidebar, TabBar } from './components/Nav'
import { QuickAdd } from './components/QuickAdd'
import { ToastHost } from './design'
import { topPick } from './engine/score'
import { dayKey, parseHm } from './engine/time'
import { cn } from './lib/cn'
import { isTyping, useIsDesktop } from './lib/hooks'
import { tBase } from './lib/motion'
import { notify, stageMorning } from './lib/notify'
import { FocusScreen } from './screens/Focus'
import { GoalsScreen } from './screens/Goals'
import { KnowledgeScreen } from './screens/Knowledge'
import { NowScreen } from './screens/Now'
import { Onboarding } from './screens/onboarding/Onboarding'
import { ReviewScreen } from './screens/Review'
import { SettingsScreen } from './screens/Settings'
import { TasksScreen } from './screens/Tasks'
import { rankState, useApp } from './store/app'
import { useUI } from './store/ui'
import { startSync } from './data/sync'

export function App() {
  useTheme()
  useLifecycle()
  useMorningNudge()
  useEffect(() => {
    void initAI()
    void startSync()
    // Re-judge with the model whenever the world it reasons about changes.
    return useApp.subscribe((s, prev) => {
      if (s.tasks !== prev.tasks || s.goals !== prev.goals || s.kb !== prev.kb) scheduleRanking()
    })
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </MotionConfig>
  )
}

function Shell() {
  const location = useLocation()
  const onboarded = useApp((s) => s.onboarded)
  const desktop = useIsDesktop()
  const path = location.pathname
  const isFocus = path === '/focus'
  const chrome = onboarded && !isFocus && path !== '/welcome'
  const showFab = chrome && (path === '/' || path === '/tasks')
  const section = path.split('/')[1] || 'now'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!chrome || isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || useUI.getState().sheets > 0) return
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        useUI.getState().setQuickAdd(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chrome])

  useEffect(() => window.scrollTo(0, 0), [section])

  if (!onboarded && path !== '/welcome') return <Navigate to="/welcome" replace />
  if (onboarded && path === '/welcome') return <Navigate to="/" replace />

  return (
    <>
      {chrome && <Sidebar />}
      <div className={cn(chrome && 'md:pl-[208px]')}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={section}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: tBase }}
            exit={{ opacity: 0, transition: { duration: 0.14 } }}
          >
            <Routes location={location}>
              <Route path="/welcome" element={<Onboarding />} />
              <Route path="/" element={<NowScreen />} />
              <Route path="/focus" element={<FocusScreen />} />
              <Route path="/tasks" element={<TasksScreen />} />
              <Route path="/goals" element={<GoalsScreen />} />
              <Route path="/review" element={<ReviewScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/settings/knowledge" element={<KnowledgeScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>
      {chrome && <TabBar />}
      <AnimatePresence>{showFab && <Fab key="fab" />}</AnimatePresence>
      {onboarded && <QuickAdd />}
      {chrome && <AutoSheets />}
      <ToastHost offsetForTabs={chrome && !desktop} />
    </>
  )
}

function useTheme() {
  const theme = useApp((s) => s.settings.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      const root = document.documentElement
      if (root.classList.contains('dark') === dark) return
      const flip = () => root.classList.toggle('dark', dark)
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (doc.startViewTransition && !reduce) doc.startViewTransition(flip)
      else flip()
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

/** Tracks time away. Coming back after a while gets a fresh answer and a quiet welcome. */
function useLifecycle() {
  useEffect(() => {
    const onVisible = () => {
      const s = useApp.getState()
      if (document.visibilityState !== 'visible') {
        s.markActive()
        return
      }
      const away = Date.now() - s.meta.lastActiveAt
      if (s.onboarded && s.settings.nudgesEnabled && away > 30 * 60_000) {
        const prev = s.currentId
        s.setCurrent(null)
        useUI.getState().bumpWelcomeBack(prev)
      }
      s.markActive()
    }
    onVisible()
    document.addEventListener('visibilitychange', onVisible)
    const i = window.setInterval(() => document.visibilityState === 'visible' && useApp.getState().markActive(), 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(i)
    }
  }, [])
}

/** External trigger: "Your first task today is ready." */
function useMorningNudge() {
  useEffect(() => {
    const check = () => {
      const s = useApp.getState()
      if (!s.onboarded) return
      const top = topPick(rankState(s))
      void stageMorning({
        time: s.settings.morningTime,
        enabled: s.settings.morningEnabled,
        title: 'Your first task today is ready',
        body: top?.task.title ?? 'Open to see what matters most.',
      })
      if (!s.settings.morningEnabled || s.meta.lastMorningNotified === dayKey()) return
      const now = new Date()
      if (now.getHours() * 60 + now.getMinutes() < parseHm(s.settings.morningTime)) return
      // Already here, or the morning has passed: nothing to nudge.
      if (document.visibilityState === 'visible' || now.getHours() >= 12 || !top) {
        s.markMorningNotified()
        return
      }
      void notify('Your first task today is ready', top.task.title, 'morning').then((ok) => ok && s.markMorningNotified())
    }
    check()
    const i = window.setInterval(check, 60_000)
    return () => window.clearInterval(i)
  }, [])
}
