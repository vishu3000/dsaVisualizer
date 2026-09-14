'use client'

import { useRef } from 'react'

type SplitterProps = {
  /** 'vertical' splits left/right and drags along x. */
  orientation: 'vertical' | 'horizontal'
  label: string
  /** Called with the pointer position relative to the container, in px. */
  onDrag: (position: number) => void
  containerRef: React.RefObject<HTMLElement | null>
  /** Keyboard nudge, in px. */
  onNudge?: (delta: number) => void
}

export function Splitter({ orientation, label, onDrag, containerRef, onNudge }: SplitterProps) {
  const dragging = useRef(false)

  function report(event: { clientX: number; clientY: number }) {
    const box = containerRef.current?.getBoundingClientRect()
    if (!box) return
    onDrag(
      orientation === 'vertical' ? event.clientX - box.left : event.clientY - box.top,
    )
  }

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      tabIndex={0}
      className={`splitter splitter-${orientation}${dragging.current ? ' splitter-active' : ''}`}
      onPointerDown={(event) => {
        dragging.current = true
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Capture is an optimisation: without it the drag still tracks while
          // the pointer stays over the handle.
        }
        // Stops the editor and the page from selecting text mid-drag.
        event.preventDefault()
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return
        report(event)
      }}
      onPointerUp={(event) => {
        dragging.current = false
        try {
          event.currentTarget.releasePointerCapture(event.pointerId)
        } catch {
          // Nothing to release.
        }
      }}
      onKeyDown={(event) => {
        if (!onNudge) return
        const back = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp'
        const forward = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown'
        if (event.key === back) {
          event.preventDefault()
          onNudge(-16)
        } else if (event.key === forward) {
          event.preventDefault()
          onNudge(16)
        }
      }}
    >
      <span className="splitter-grip" />
    </div>
  )
}
