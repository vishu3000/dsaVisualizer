import { useEffect } from 'react'

import { usePlayer } from './store.ts'

/** Typing in the editor, a select or a field must never drive the transport. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.closest('.monaco-editor')) return true
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)
}

export function useTransportKeys(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return

      const player = usePlayer.getState()
      if (!player.trace) return

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          player.stepBy(-1)
          return
        case 'ArrowRight':
          event.preventDefault()
          player.stepBy(1)
          return
        case ' ':
        case 'Spacebar':
          // Space would otherwise scroll the page.
          event.preventDefault()
          player.togglePlaying()
          return
        case 'Home':
          event.preventDefault()
          player.seek(0)
          return
        case 'End':
          event.preventDefault()
          player.seek(player.trace.meta.steps - 1)
          return
        default:
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
