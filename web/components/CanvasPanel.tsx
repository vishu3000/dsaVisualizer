'use client'

import { useMemo } from 'react'

import { DictRender } from '@/components/render/Dict.tsx'
import { GraphRender } from '@/components/render/Graph.tsx'
import { HeapRender } from '@/components/render/Heap.tsx'
import { LinkedListRender } from '@/components/render/LinkedList.tsx'
import { ListRender } from '@/components/render/List.tsx'
import { QueueRender } from '@/components/render/Queue.tsx'
import { StackRender } from '@/components/render/Stack.tsx'
import { SetRender } from '@/components/render/Set.tsx'
import { TreeRender } from '@/components/render/Tree.tsx'
import { RunProgress } from '@/components/RunProgress.tsx'
import {
  EMPTY_INFERENCE,
  inferForList,
  innermostFrame,
  mutatedEntries,
  mutatedIndices,
  mutatedMembers,
  valueCursors,
} from '@/lib/infer.ts'
import type { ProgressResponse } from '@/lib/pyodide/messages.ts'
import { planCanvas, type RenderPlan } from '@/lib/renderers.ts'
import { graphHighlights } from '@/lib/shapes.ts'
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

const KIND_LABEL: Record<RenderPlan['kind'], string> = {
  list: 'list',
  tuple: 'tuple',
  deque: 'deque',
  dict: 'dict',
  set: 'set',
  graph: 'graph',
  tree: 'tree',
  linkedlist: 'linked list',
  heap: 'heap',
  stack: 'stack',
  queue: 'queue',
}

function sizeOf(plan: RenderPlan): string {
  switch (plan.kind) {
    case 'graph':
      return `${plan.model.nodes.length} nodes`
    case 'tree':
      return `${plan.model.size} nodes`
    case 'linkedlist':
      return `${plan.model.nodes.length} nodes`
    case 'heap':
      return `${plan.model.size} items`
    case 'dict':
      return `${(plan.obj as Extract<HeapObj, { kind: 'dict' }>).entries.length}`
    default: {
      const obj = plan.obj
      return 'items' in obj ? String(obj.items.length) : ''
    }
  }
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
  const frame = innermostFrame(snapshot)
  const viz = trace?.meta.viz ?? {}

  const { plans, rest } = useMemo(() => planCanvas(snapshot, viz), [snapshot, viz])

  /** Heap refs a local currently points at — what "active" means for a node. */
  const activeRefs = useMemo(() => {
    const refs = new Set<string>()
    if (!frame) return refs
    for (const val of Object.values(frame.locals)) {
      if ('ref' in val) refs.add(val.ref)
    }
    return refs
  }, [frame])

  const refLabels = useMemo(() => {
    const map = new Map<string, string[]>()
    if (!frame) return map
    for (const [name, val] of Object.entries(frame.locals)) {
      if (!('ref' in val)) continue
      map.set(val.ref, [...(map.get(val.ref) ?? []), name])
    }
    return map
  }, [frame])

  const traceError = trace?.meta.error
  const count = Object.keys(heap).length
  // null, not [], for a trace recorded before the tracer reported this: an
  // empty list means "this program indexes nothing", which is a real answer.
  const indexNames = trace?.meta.indexNames ?? null
  const iterNames = trace?.meta.iterNames ?? {}

  return (
    <section className="canvas">
      <div className="pane-head">
        <div className="canvas-head-left">
          <span className="pane-label">Visualization</span>
          {snapshot && (
            <span className="chip">
              {plans.length} drawn · {count} heap object{count === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <span className="pane-meta">@viz drives the renderer</span>
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
                <span className="empty-note">Pick a problem, or write Python and hit Run.</span>
              </div>
            )}

            {snapshot && count === 0 && (
              <div className="empty-state">
                <span className="empty-title">Heap is empty</span>
                <span className="empty-note">Nothing has been allocated at this step.</span>
              </div>
            )}

            {plans.map((plan) => (
              <div className="viz-block" key={plan.heapId}>
                <div className="viz-title">
                  <span className="viz-name">{plan.name ?? `#${plan.heapId.slice(-5)}`}</span>
                  <span className="viz-type">
                    {KIND_LABEL[plan.kind]}
                    {sizeOf(plan) && ` · ${sizeOf(plan)}`}
                  </span>
                  {plan.aliases.length > 0 && (
                    <span className="viz-alias">also {plan.aliases.join(', ')}</span>
                  )}
                </div>

                {plan.kind === 'graph' ? (
                  (() => {
                    const marks = graphHighlights(frame, heap, plan.model)
                    return (
                      <GraphRender
                        model={plan.model}
                        visited={marks.visited}
                        pointers={marks.pointers}
                      />
                    )
                  })()
                ) : plan.kind === 'tree' ? (
                  <TreeRender model={plan.model} active={activeRefs} />
                ) : plan.kind === 'linkedlist' ? (
                  <LinkedListRender model={plan.model} active={activeRefs} labels={refLabels} />
                ) : plan.kind === 'heap' ? (
                  <HeapRender
                    model={plan.model}
                    mutated={mutatedIndices(plan.obj, previous?.heap[plan.heapId])}
                  />
                ) : plan.kind === 'dict' ? (
                  <DictRender
                    heapId={plan.heapId}
                    obj={plan.obj as Extract<HeapObj, { kind: 'dict' }>}
                    heap={heap}
                    mutated={mutatedEntries(plan.obj, previous?.heap[plan.heapId])}
                  />
                ) : plan.kind === 'stack' ? (
                  <StackRender
                    heapId={plan.heapId}
                    obj={plan.obj as Extract<HeapObj, { items: never[] }>}
                    heap={heap}
                    mutated={mutatedIndices(plan.obj, previous?.heap[plan.heapId])}
                  />
                ) : plan.kind === 'queue' ? (
                  <QueueRender
                    heapId={plan.heapId}
                    obj={plan.obj as Extract<HeapObj, { items: never[] }>}
                    heap={heap}
                    mutated={mutatedIndices(plan.obj, previous?.heap[plan.heapId])}
                  />
                ) : plan.kind === 'set' ? (
                  <SetRender
                    heapId={plan.heapId}
                    obj={plan.obj as Extract<HeapObj, { kind: 'set' }>}
                    heap={heap}
                    mutated={mutatedMembers(plan.obj, previous?.heap[plan.heapId])}
                  />
                ) : (
                  <ListRender
                    heapId={plan.heapId}
                    obj={plan.obj as Extract<HeapObj, { items: never[] }>}
                    heap={heap}
                    inference={
                      plan.kind === 'list' && 'items' in plan.obj
                        ? inferForList(
                            frame,
                            plan.obj.items.length,
                            indexNames,
                            frame
                              ? valueCursors(frame, plan.obj.items, plan.heapId, iterNames)
                              : undefined,
                          )
                        : EMPTY_INFERENCE
                    }
                    mutated={mutatedIndices(plan.obj, previous?.heap[plan.heapId])}
                  />
                )}
              </div>
            ))}

            {rest.length > 0 && (
              <details className="viz-rest">
                <summary>
                  {rest.length} other heap object{rest.length === 1 ? '' : 's'} (raw)
                </summary>
                <pre className="json-dump">{JSON.stringify(Object.fromEntries(rest), null, 2)}</pre>
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
          <span className="legend-swatch swatch-visited" />
          visited
        </span>
        <span className="legend-item">
          <span className="legend-swatch swatch-dim" />
          out of range
        </span>
      </div>
    </section>
  )
}
