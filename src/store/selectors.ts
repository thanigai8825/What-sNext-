import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { explain } from '../engine/explain'
import { rank, topPick } from '../engine/score'
import type { EngineInput, Ranked } from '../engine/types'
import { useNow } from '../lib/hooks'
import { engineInput, useApp, type Data } from './app'

const pickData = (s: Data) => ({
  goals: s.goals,
  tasks: s.tasks,
  ratings: s.ratings,
  skips: s.skips,
  kb: s.kb,
  session: s.session,
  learning: s.learning,
  plans: s.plans,
  ai: s.ai,
  settings: s.settings,
})

/** The engine's view of the world, recomputed when data changes and once a minute. */
export function useRanked(): { ranked: Ranked[]; input: EngineInput } {
  const data = useApp(useShallow(pickData))
  const tick = useNow(60_000)
  return useMemo(() => {
    const input = engineInput(data as Data, new Date(tick))
    return { ranked: rank(input), input }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tick])
}

/**
 * The one answer. Sticky: once shown, it stays until the person acts
 * (done, not now, add, edit) or comes back after time away.
 */
export function useFocusPick() {
  const { ranked, input } = useRanked()
  const currentId = useApp((s) => s.currentId)
  const setCurrent = useApp((s) => s.setCurrent)
  const current = ranked.find((r) => r.task.id === currentId && r.available && r.bucket !== 'skip')
  const top = current ?? topPick(ranked)

  useEffect(() => {
    if (top && top.task.id !== currentId) setCurrent(top.task.id)
  }, [top, currentId, setCurrent])

  const upNext = useMemo(
    () => ranked.filter((r) => r.task.id !== top?.task.id && r.available && r.bucket !== 'skip').slice(0, 2),
    [ranked, top],
  )
  const explanation = useMemo(() => (top ? explain(top, input) : null), [top, input])
  return { ranked, input, top, upNext, explanation }
}

export function useGoal(id: string | null | undefined) {
  return useApp((s) => (id ? s.goals.find((g) => g.id === id) ?? null : null))
}
