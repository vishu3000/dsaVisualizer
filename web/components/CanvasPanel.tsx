'use client'

import { RunProgress } from '@/components/RunProgress.tsx'
import type { ProgressResponse } from '@/lib/pyodide/messages.ts'
import type { Snapshot, Trace } from '@/lib/trace/types.ts'

type CanvasPanelProps = {
  snapshot: Snapshot | null
  trace: Trace | null
  progress: ProgressResponse | null
  running: boolean
  error: string | null
  errorDetail: string | null
}

export function CanvasPanel({
  snapshot,
  trace,
  progress,
  running,
  error,
  errorDetail,
}: CanvasPanelProps) {
  const heap = snapshot?.heap ?? {}
  const count = Object.keys(heap).length
  const hints = Object.entries(trace?.meta.viz ?? {})
  const traceError = trace?.meta.error

  return (
    <section className="canvas">
      <div className="pane-head">
        <div className="canvas-head-left">
          <span className="pane-label">Visualization</span>
          {snapshot && (
            <span className="chip">
              heap · {count} object{count === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <span className="pane-meta">renderers land in M6</span>
      </div>

      <div className="canvas-body">
        {running ? (
          <RunProgress progress={progress} />
        ) : (
          <>
            {error && (
              <div className="error-card">
                <div className="error-title">{error}</div>
                {errorDetail && <div className="error-body">{errorDetail}</div>}
              </div>
            )}

            {traceError && (
              <div className="error-card">
                <div className="error-title">
                  {traceError.type} on line {traceError.line}
                </div>
                <div className="error-body">{traceError.message}</div>
              </div>
            )}

            {snapshot ? (
              count === 0 ? (
                <div className="empty-state">
                  <span className="empty-title">Heap is empty</span>
                  <span className="empty-note">Nothing has been allocated at this step.</span>
                </div>
              ) : (
                <pre className="json-dump">{JSON.stringify(heap, null, 2)}</pre>
              )
            ) : (
              !error && (
                <div className="empty-state">
                  <span className="empty-title">No trace loaded</span>
                  <span className="empty-note">Pick a trace, or write Python and hit Run.</span>
                </div>
              )
            )}
          </>
        )}
      </div>

      <div className="legend">
        {hints.length > 0 ? (
          hints.map(([name, kind]) => (
            <span className="legend-item" key={name}>
              <span className="legend-swatch" />
              <span className="legend-key">{name}</span>
              {kind}
            </span>
          ))
        ) : (
          <span className="legend-item">no @viz hints in this trace</span>
        )}
      </div>
    </section>
  )
}
