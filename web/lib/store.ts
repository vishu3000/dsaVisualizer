import { useMemo } from 'react'
import { create } from 'zustand'

import { reconstruct } from './trace/reconstruct.ts'
import type { Snapshot, Trace } from './trace/types.ts'

export type Status = 'empty' | 'loading' | 'ready' | 'error'

export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const

/** Milliseconds between steps at 1x. */
export const BASE_INTERVAL_MS = 260

type PlayerState = {
  trace: Trace | null
  currentStep: number
  playing: boolean
  speed: number
  status: Status
  // Not derivable from the trace, so they have to live here too: the source
  // Monaco renders, which fixture it came from, and why a load failed.
  source: string
  fixture: string | null
  error: string | null

  load: (fixture: string) => Promise<void>
  seek: (step: number) => void
  stepBy: (delta: number) => void
  setPlaying: (playing: boolean) => void
  togglePlaying: () => void
  setSpeed: (speed: number) => void
}

export const usePlayer = create<PlayerState>((set, get) => ({
  trace: null,
  currentStep: 0,
  playing: false,
  speed: 1,
  status: 'empty',
  source: '',
  fixture: null,
  error: null,

  load: async (fixture) => {
    set({ status: 'loading', playing: false, fixture, error: null })
    try {
      const [traceResponse, sourceResponse] = await Promise.all([
        fetch(`fixtures/${fixture}.json`),
        fetch(`examples/${fixture}.py`),
      ])
      if (!traceResponse.ok) throw new Error(`trace ${traceResponse.status}`)
      if (!sourceResponse.ok) throw new Error(`source ${sourceResponse.status}`)

      const trace: Trace = await traceResponse.json()
      const source = await sourceResponse.text()
      set({ trace, source, currentStep: 0, status: 'ready' })
    } catch (cause) {
      set({
        status: 'error',
        trace: null,
        source: '',
        error: cause instanceof Error ? cause.message : String(cause),
      })
    }
  },

  seek: (step) => {
    const { trace } = get()
    if (!trace) return
    const last = trace.meta.steps - 1
    set({ currentStep: Math.max(0, Math.min(last, Math.trunc(step))) })
  },

  stepBy: (delta) => {
    const { trace, currentStep } = get()
    if (!trace) return
    const last = trace.meta.steps - 1
    const next = Math.max(0, Math.min(last, currentStep + delta))
    set({ currentStep: next, playing: next === last ? false : get().playing })
  },

  setPlaying: (playing) => {
    const { trace, currentStep } = get()
    if (!trace) return
    // Hitting play at the end restarts rather than doing nothing.
    if (playing && currentStep >= trace.meta.steps - 1) {
      set({ currentStep: 0, playing: true })
      return
    }
    set({ playing })
  },

  togglePlaying: () => get().setPlaying(!get().playing),

  setSpeed: (speed) => set({ speed }),
}))

/**
 * The snapshot for the current step, derived on demand and never stored.
 *
 * Deliberately a hook rather than a store selector: reconstruct() returns a
 * fresh object every call, and zustand compares selector results by identity,
 * so using it as a selector would re-render forever. Memoizing on
 * (trace, step) gives a stable reference until one of them actually changes.
 */
export function useSnapshot(): Snapshot | null {
  const trace = usePlayer((state) => state.trace)
  const currentStep = usePlayer((state) => state.currentStep)
  const status = usePlayer((state) => state.status)

  return useMemo(
    () => (trace && status === 'ready' ? reconstruct(trace, currentStep) : null),
    [trace, currentStep, status],
  )
}
