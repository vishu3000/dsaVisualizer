'use client'

import { useMemo, useState } from 'react'

import { CallStackView } from '@/components/render/CallStack.tsx'
import { RecursionTree } from '@/components/render/RecursionTree.tsx'
import { buildCallTree, EMPTY_TREE } from '@/lib/callTree.ts'
import { formatVal, previewHeap, toneOf } from '@/lib/format.ts'
import { innermostFrame } from '@/lib/infer.ts'
import type { Snapshot, Trace } from '@/lib/trace/types.ts'

type Tab = 'stack' | 'variables'

function VariablesView({ snapshot }: { snapshot: Snapshot }) {
  const frame = innermostFrame(snapshot)
  const locals = frame ? Object.entries(frame.locals) : []

  return (
    <div className="variables">
      <div className="variables-head">
        <span className="variables-scope">{frame?.fn ?? '—'}</span>
        <span className="variables-count">
          {locals.length} name{locals.length === 1 ? '' : 's'}
        </span>
      </div>

      {locals.length === 0 ? (
        <div className="list-empty">no locals in this frame</div>
      ) : (
        <table className="variables-table">
          <tbody>
            {locals.map(([name, val]) => {
              const target = 'ref' in val ? snapshot.heap[val.ref] : undefined
              return (
                <tr key={name}>
                  <td className="var-name">{name}</td>
                  <td className={`var-type tone-${toneOf(val)}`}>
                    {formatVal(val, snapshot.heap)}
                  </td>
                  <td className="var-preview">
                    {target ? previewHeap(target, snapshot.heap) : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <div className="variables-stdout">
        <span className="variables-scope">stdout</span>
        <pre className="json-dump">
          {snapshot.stdout === '' ? (
            <span className="local-empty">nothing printed yet</span>
          ) : (
            snapshot.stdout
          )}
        </pre>
      </div>
    </div>
  )
}

type InspectorProps = {
  snapshot: Snapshot | null
  trace: Trace | null
  step: number
  onSeek: (step: number) => void
}

export function InspectorPanel({ snapshot, trace, step, onSeek }: InspectorProps) {
  const [tab, setTab] = useState<Tab>('stack')

  // One pass over the whole trace, redone only when the trace itself changes.
  const tree = useMemo(() => (trace ? buildCallTree(trace) : EMPTY_TREE), [trace])

  const frames = snapshot?.stack ?? []
  const localCount = snapshot ? Object.keys(innermostFrame(snapshot)?.locals ?? {}).length : 0

  return (
    <section className="inspector">
      <div className="inspector-head">
        <div className="tabs">
          <button
            type="button"
            className={tab === 'stack' ? 'tab tab-active' : 'tab'}
            onClick={() => setTab('stack')}
          >
            Call Stack <span className="tab-count">{frames.length}</span>
          </button>
          <button
            type="button"
            className={tab === 'variables' ? 'tab tab-active' : 'tab'}
            onClick={() => setTab('variables')}
          >
            Variables <span className="tab-count">{localCount}</span>
          </button>
        </div>
        {snapshot && <span className="pane-meta">depth {frames.length}</span>}
      </div>

      <div className="inspector-body">
        {!snapshot ? (
          <div className="empty-state">
            <span className="empty-title">Nothing to inspect</span>
            <span className="empty-note">Frames and locals appear once a trace is loaded.</span>
          </div>
        ) : tab === 'stack' ? (
          <div className="stack-split">
            <CallStackView snapshot={snapshot} />
            <RecursionTree tree={tree} step={step} onSeek={onSeek} />
          </div>
        ) : (
          <VariablesView snapshot={snapshot} />
        )}
      </div>
    </section>
  )
}
