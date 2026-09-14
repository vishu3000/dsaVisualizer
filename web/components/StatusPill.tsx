'use client'

import { usePlayer } from '@/lib/store.ts'

export function StatusPill() {
  const status = usePlayer((state) => state.status)
  const error = usePlayer((state) => state.error)
  const trace = usePlayer((state) => state.trace)
  const origin = usePlayer((state) => state.origin)
  const dirty = usePlayer((state) => state.dirty)
  const progress = usePlayer((state) => state.progress)
  const elapsedMs = usePlayer((state) => state.elapsedMs)

  if (status === 'running') {
    return (
      <span className="pill pill-ready" title={progress?.message}>
        <span className="pill-dot pill-dot-pulse" />
        {progress?.phase === 'running' ? 'tracing' : 'starting python'}
      </span>
    )
  }

  if (status === 'loading') return <span className="pill">loading</span>

  if (status === 'error') {
    return (
      <span className="pill pill-error" title={error ?? undefined}>
        <span className="pill-dot" />
        {error}
      </span>
    )
  }

  if (status !== 'ready' || !trace) return <span className="pill">idle</span>

  if (trace.meta.error) {
    return (
      <span className="pill pill-error" title={trace.meta.error.message}>
        <span className="pill-dot" />
        halted · {trace.meta.error.type}
      </span>
    )
  }

  if (trace.meta.truncated) {
    return (
      <span className="pill pill-warn">
        <span className="pill-dot" />
        truncated
      </span>
    )
  }

  return (
    <span className="pill pill-ready">
      <span className="pill-dot" />
      {origin === 'live' ? 'traced' : 'fixture'}
      {elapsedMs !== null && origin === 'live' && ` · ${(elapsedMs / 1000).toFixed(1)}s`}
      {dirty && <span className="pill-edited">edited</span>}
    </span>
  )
}
