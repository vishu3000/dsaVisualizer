'use client'

import { ListRender } from '@/components/render/List.tsx'
import { RunProgress } from '@/components/RunProgress.tsx'
import {
  EMPTY_INFERENCE,
  inferForList,
  innermostFrame,
  mutatedIndices,
  namesForRef,
} from '@/lib/infer.ts'
import type { ProgressResponse } from '@/lib/pyodide/messages.ts'
import type { HeapObj, Snapshot, Trace } from '@/lib/trace/types.ts'

type CanvasPanelProps = {
  snapshot: Snapshot | null
  previous: Snapshot | null
  trace: Trace | null
  progress: ProgressResponse | null
  running: boolean
  error: string | null
  errorDetail: string | null
}

const SEQUENCE_KINDS = new Set(['list', 'tuple', 'deque'])

function hasItems(obj: HeapObj): obj is Extract<HeapObj, { items: unknown[] }> {
  return 'items' in obj
}

export function CanvasPanel({
  snapshot,
  previous,
  trace,
  progress,
  running,
  error,
  errorDetail,
}: CanvasPanelProps) {
  const heap = snapshot?.heap ?? {}
  const entries = Object.entries(heap)
  const count = entries.length
  const hints = Object.entries(trace?.meta.viz ?? {})
  const traceError = trace?.meta.error

  const frame = innermostFrame(snapshot)
  const sequences = entries.filter(([, obj]) => SEQUENCE_KINDS.has(obj.kind) && hasItems(obj))
  const others = entries.filter(([, obj]) => !SEQUENCE_KINDS.has(obj.kind) || !hasItems(obj))

  return (
    <section className="canvas">
      <div className="pane-head">
        <div className="canvas-head-left">
          <span className="pane-label">Visualization</span>
          {snapshot && (
            <span className="chip">
              {sequences.length} drawn · {count} heap object{count === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <span className="pane-meta">list · tuple · deque</span>
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

            {!snapshot && !error && (
              <div className="empty-state">
                <span className="empty-title">No trace loaded</span>
                <span className="empty-note">Pick a trace, or write Python and hit Run.</span>
              </div>
            )}

            {snapshot && count === 0 && (
              <div className="empty-state">
                <span className="empty-title">Heap is empty</span>
                <span className="empty-note">Nothing has been allocated at this step.</span>
              </div>
            )}

            {sequences.map(([heapId, obj]) => {
              if (!hasItems(obj)) return null
              const names = namesForRef(snapshot, heapId)
              const inference =
                obj.kind === 'list' ? inferForList(frame, obj.items.length) : EMPTY_INFERENCE
              const mutated = mutatedIndices(obj, previous?.heap[heapId])

              return (
                <div className="viz-block" key={heapId}>
                  <div className="viz-title">
                    <span className="viz-name">{names[0] ?? `#${heapId.slice(-5)}`}</span>
                    <span className="viz-type">
                      {obj.kind}[{obj.items.length}]
                    </span>
                    {names.length > 1 && (
                      <span className="viz-alias">also {names.slice(1).join(', ')}</span>
                    )}
                  </div>
                  <ListRender
                    heapId={heapId}
                    obj={obj}
                    heap={heap}
                    inference={inference}
                    mutated={mutated}
                  />
                </div>
              )
            })}

            {others.length > 0 && (
              <details className="viz-rest">
                <summary>
                  {others.length} other heap object{others.length === 1 ? '' : 's'} (raw)
                </summary>
                <pre className="json-dump">
                  {JSON.stringify(Object.fromEntries(others), null, 2)}
                </pre>
              </details>
            )}
          </>
        )}
      </div>

      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch swatch-default" />
          default
        </span>
        <span className="legend-item">
          <span className="legend-swatch swatch-active" />
          active
        </span>
        <span className="legend-item">
          <span className="legend-swatch swatch-window" />
          in window
        </span>
        <span className="legend-item">
          <span className="legend-swatch swatch-mutated" />
          just mutated
        </span>
        <span className="legend-item">
          <span className="legend-swatch swatch-dim" />
          out of range
        </span>
        {hints.length > 0 && (
          <span className="legend-item legend-hints">
            @viz {hints.map(([name, kind]) => `${name} ${kind}`).join(' · ')}
          </span>
        )}
      </div>
    </section>
  )
}
