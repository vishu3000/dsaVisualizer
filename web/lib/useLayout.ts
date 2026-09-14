import { useCallback, useEffect, useState } from 'react'

export type PaneLayout = {
  /** Editor width in px. */
  editor: number
  /** Share of the right column given to the canvas, 0..1. */
  canvas: number
}

const DEFAULTS: PaneLayout = { editor: 520, canvas: 0.62 }
const STORAGE_KEY = 'dsa-visualizer:layout'

export const LIMITS = {
  editor: [280, 900],
  canvas: [0.18, 0.86],
} as const

function clamp(value: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, value))
}

function sanitize(input: Partial<PaneLayout>): PaneLayout {
  return {
    editor: clamp(Number(input.editor) || DEFAULTS.editor, LIMITS.editor),
    canvas: clamp(Number(input.canvas) || DEFAULTS.canvas, LIMITS.canvas),
  }
}

/**
 * Pane sizes, remembered per browser. Read after mount rather than during
 * render: the server-rendered HTML has no access to localStorage, and a
 * mismatch would trip hydration.
 */
export function useLayout() {
  const [layout, setLayout] = useState<PaneLayout>(DEFAULTS)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) setLayout(sanitize(JSON.parse(stored)))
    } catch {
      // A private window or blocked storage is not a reason to fail.
    }
  }, [])

  const update = useCallback((patch: Partial<PaneLayout>) => {
    setLayout((current) => {
      const next = sanitize({ ...current, ...patch })
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Ignore: the layout still applies for this session.
      }
      return next
    })
  }, [])

  const reset = useCallback(() => update(DEFAULTS), [update])

  return { layout, update, reset }
}
