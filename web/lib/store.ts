import { useMemo } from 'react'
import { create } from 'zustand'

import type { ProgressResponse } from './pyodide/messages.ts'
import { RunFailure, runSource } from './runner.ts'
import { reconstruct } from './trace/reconstruct.ts'
import type { Snapshot, Trace } from './trace/types.ts'

export type Status = 'empty' | 'loading' | 'running' | 'ready' | 'error'

/** Where the current trace came from. */
export type TraceOrigin = 'fixture' | 'live'

export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const

/** Milliseconds between steps at 1x. */
export const BASE_INTERVAL_MS = 260

/**
 * What "New" drops into the editor. Deliberately runnable: an empty buffer
 * would leave Run disabled and the canvas blank, which reads as broken rather
 * than as a starting point. Nothing about it is written to disk.
 */
export const SCRATCH_SOURCE = `# Scratch buffer — nothing here is saved.
# Edit freely and press Run (Cmd/Ctrl + Enter) to trace it.

def solve(nums):
    total = 0
    for n in nums:
        total += n
    return total


solve([4, 1, 7, 3])
`

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
  errorDetail: string | null
  origin: TraceOrigin
  /** Set while the worker is booting or tracing; null otherwise. */
  progress: ProgressResponse | null
  /** Tracing time of the last live run, in milliseconds. */
  elapsedMs: number | null
  /** True once the editor has been changed since the loaded source. */
  dirty: boolean
  /**
   * Renderer choices made from the canvas, as {local name: kind}. Keyed by
   * name rather than heap id because id() changes on every run, and merged
   * over meta.viz, so an override is just an `@viz` line the source does not
   * have to carry.
   */
  vizOverrides: Record<string, string>

  load: (fixture: string) => Promise<void>
  newScratch: () => void
  setSource: (source: string) => void
  setVizOverride: (name: string, kind: string | null) => void
  run: () => Promise<void>
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
  errorDetail: null,
  origin: 'fixture',
  progress: null,
  elapsedMs: null,
  dirty: false,
  vizOverrides: {},

  load: async (fixture) => {
    set({
      status: 'loading',
      playing: false,
      fixture,
      error: null,
      errorDetail: null,
      progress: null,
      // Overrides are keyed by local name, so they would otherwise follow a
      // name like `queue` into an unrelated program.
      vizOverrides: {},
    })
    try {
      const [traceResponse, sourceResponse] = await Promise.all([
        fetch(`fixtures/${fixture}.json`),
        fetch(`examples/${fixture}.py`),
      ])
      if (!traceResponse.ok) throw new Error(`trace ${traceResponse.status}`)
      if (!sourceResponse.ok) throw new Error(`source ${sourceResponse.status}`)

      const trace: Trace = await traceResponse.json()
      const source = await sourceResponse.text()
      set({
        trace,
        source,
        currentStep: 0,
        status: 'ready',
        origin: 'fixture',
        dirty: false,
        elapsedMs: null,
      })
    } catch (cause) {
      set({
        status: 'error',
        trace: null,
        source: '',
        error: cause instanceof Error ? cause.message : String(cause),
      })
    }
  },

  /**
   * Start from a blank buffer. The old trace is dropped rather than left on
   * screen, so the canvas never shows a visualisation of code the editor no
   * longer holds.
   */
  newScratch: () =>
    set({
      source: SCRATCH_SOURCE,
      trace: null,
      currentStep: 0,
      playing: false,
      status: 'empty',
      fixture: null,
      origin: 'live',
      dirty: true,
      error: null,
      errorDetail: null,
      progress: null,
      elapsedMs: null,
      vizOverrides: {},
    }),

  /** Null clears the choice and hands the block back to automatic routing. */
  setVizOverride: (name, kind) =>
    set((state) => {
      const next = { ...state.vizOverrides }
      if (kind === null) delete next[name]
      else next[name] = kind
      return { vizOverrides: next }
    }),

  setSource: (source) => set({ source, dirty: true }),

  run: async () => {
    const { source, status } = get()
    if (status === 'running' || source.trim() === '') return

    set({
      status: 'running',
      playing: false,
      error: null,
      errorDetail: null,
      progress: null,
    })

    try {
      const started = Date.now()
      const trace = await runSource(source, {
        onProgress: (progress) => set({ progress }),
      })
      set({
        trace,
        currentStep: 0,
        status: 'ready',
        origin: 'live',
        dirty: false,
        progress: null,
        elapsedMs: Date.now() - started,
      })
    } catch (cause) {
      const failure = cause instanceof RunFailure ? cause : null
      set({
        status: 'error',
        progress: null,
        // The previous trace stays loaded: a failed run should not wipe what
        // the user was looking at.
        error: failure?.message ?? (cause instanceof Error ? cause.message : String(cause)),
        errorDetail: failure?.detail ?? null,
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

  // Derived from the trace alone, not from status: a failed run leaves the
  // previous trace on screen rather than blanking the panels.
  return useMemo(() => (trace ? reconstruct(trace, currentStep) : null), [trace, currentStep])
}

/**
 * The snapshot one step back, or null at step 0. "Just mutated" is a change
 * between two steps, so it cannot be read off the current snapshot alone.
 */
export function usePreviousSnapshot(): Snapshot | null {
  const trace = usePlayer((state) => state.trace)
  const currentStep = usePlayer((state) => state.currentStep)

  return useMemo(
    () => (trace && currentStep > 0 ? reconstruct(trace, currentStep - 1) : null),
    [trace, currentStep],
  )
}
