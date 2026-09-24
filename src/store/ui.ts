import { create } from 'zustand'
import { useApp } from './app'

export interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

interface UIState {
  toast: Toast | null
  showToast(message: string, action?: Toast['action']): void
  dismissToast(): void

  quickAddOpen: boolean
  setQuickAdd(open: boolean): void

  /** Number of sheets currently open; single-key shortcuts pause while > 0. */
  sheets: number
  pushSheet(): void
  popSheet(): void

  /** null until the AI endpoint has been checked */
  aiEnabled: boolean | null
  setAIEnabled(on: boolean): void
  /** Ranking in flight, plus the partially streamed reason per task id. */
  aiBusy: boolean
  aiPartial: Record<string, string>
  setAIBusy(busy: boolean): void
  setAIPartial(id: string, text: string): void
  clearAIPartial(): void

  /** Set when the person comes back after being away; remembers what the card showed before. */
  welcomeBack: { at: number; prevId: string | null } | null
  bumpWelcomeBack(prevId: string | null): void
}

let toastSeq = 0

export const useUI = create<UIState>()((set) => ({
  toast: null,
  showToast: (message, action) => set({ toast: { id: ++toastSeq, message, action } }),
  dismissToast: () => set({ toast: null }),

  quickAddOpen: false,
  setQuickAdd: (open) => set({ quickAddOpen: open }),

  sheets: 0,
  pushSheet: () => set((s) => ({ sheets: s.sheets + 1 })),
  popSheet: () => set((s) => ({ sheets: Math.max(0, s.sheets - 1) })),

  aiEnabled: null,
  setAIEnabled: (on) => set({ aiEnabled: on }),
  aiBusy: false,
  aiPartial: {},
  setAIBusy: (busy) => set({ aiBusy: busy }),
  setAIPartial: (id, text) => set((s) => ({ aiPartial: { ...s.aiPartial, [id]: text } })),
  clearAIPartial: () => set({ aiPartial: {} }),

  welcomeBack: null,
  bumpWelcomeBack: (prevId) => set({ welcomeBack: { at: Date.now(), prevId } }),
}))

/** Run a change and offer to take it back for 5 seconds. */
export function withUndo(message: string, change: () => void) {
  const snap = useApp.getState().snapshot()
  change()
  useUI.getState().showToast(message, { label: 'Undo', run: () => useApp.getState().restore(snap) })
}
