'use client'

import { useMemo, useState } from 'react'

import { CallStackView } from '@/components/render/CallStack.tsx'
import { RecursionTree } from '@/components/render/RecursionTree.tsx'
import { buildCallTree, EMPTY_TREE } from '@/lib/callTree.ts'
import { formatVal, previewHeap, pyType, toneOf } from '@/lib/format.ts'
import { innermostFrame } from '@/lib/infer.ts'
import type { Snapshot, Trace } from '@/lib/trace/types.ts'

type Tab = 'stack' | 'variables' | 'stdout'

/** Lines printed so far. The trailing newline is a terminator, not a line. */
function stdoutLines(text: string): string[] {
  if (text === '') return []
  return text.replace(/\n$/, '').split('\n')
}

function VariablesView({ snapshot }: { snapshot: Snapshot }) {
  const frame = innermostFrame(snapshot)
  const locals = frame ? Object.entries(frame.locals) : []

  if (locals.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-title">No locals in {frame?.fn ?? 'this frame'}</span>
        <span className="empty-note">Nothing is bound at this step.</span>
      </div>
    )
  }

  return (
    <div className="vars">
      <div className="vars-head">
        <span className="vars-scope">{frame?.fn ?? '—'}</span>
        <span className="vars-count">
          {locals.length} name{locals.length === 1 ? '' : 's'}
        </span>
      </div>

      <table className="vars-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {locals.map(([name, val]) => {
            const target = 'ref' in val ? snapshot.heap[val.ref] : undefined
            // The type column already says `list`, so repeating `list[10]`
            // here would waste the widest column. Show what is inside instead.
            const value = target
              ? previewHeap(target, snapshot.heap)
              : formatVal(val, snapshot.heap)

            return (
              <tr key={name}>
                <td className="var-name">{name}</td>
                <td>
                  <span className="var-kind">{pyType(val, snapshot.heap)}</span>
                </td>
                <td className={`var-value tone-${toneOf(val)}`} title={value}>
                  {value}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StdoutView({ snapshot, previous }: { snapshot: Snapshot; previous: Snapshot | null }) {
  const lines = stdoutLines(snapshot.stdout)
  // Everything past what the previous step had printed is new this step.
  const printedBefore = previous ? stdoutLines(previous.stdout).length : 0

  if (lines.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-title">Nothing printed yet</span>
        <span className="empty-note">Output from print() appears here as it runs.</span>
      </div>
    )
  }

  return (
    <div className="stdout">
      <div className="stdout-head">
        <span className="vars-scope">stdout</span>
        <span className="vars-count">
          {lines.length} line{lines.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="stdout-body">
        {lines.map((line, index) => (
          <div
            // Lines are append-only, so the index is a stable identity here.
            key={index}
            className={index >= printedBefore ? 'stdout-line stdout-line-new' : 'stdout-line'}
          >
            <span className="stdout-no">{index + 1}</span>
            <span className="stdout-text">{line === '' ? ' ' : line}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

type InspectorProps = {
  snapshot: Snapshot | null
  previous: Snapshot | null
  trace: Trace | null
  step: number
  onSeek: (step: number) => void
}

export function InspectorPanel({ snapshot, previous, trace, step, onSeek }: InspectorProps) {
  const [tab, setTab] = useState<Tab>('stack')

  // One pass over the whole trace, redone only when the trace itself changes.
  const tree = useMemo(() => (trace ? buildCallTree(trace) : EMPTY_TREE), [trace])

  const frames = snapshot?.stack ?? []
  const localCount = snapshot ? Object.keys(innermostFrame(snapshot)?.locals ?? {}).length : 0
  const printed = snapshot ? stdoutLines(snapshot.stdout).length : 0

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'stack', label: 'Call Stack', count: frames.length },
    { id: 'variables', label: 'Variables', count: localCount },
    { id: 'stdout', label: 'Stdout', count: printed },
  ]

  return (
    <section className="inspector">
      <div className="inspector-head">
        <div className="tabs">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={tab === entry.id ? 'tab tab-active' : 'tab'}
              onClick={() => setTab(entry.id)}
            >
              {entry.label} <span className="tab-count">{entry.count}</span>
            </button>
          ))}
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
        ) : tab === 'variables' ? (
          <VariablesView snapshot={snapshot} />
        ) : (
          <StdoutView snapshot={snapshot} previous={previous} />
        )}
      </div>
    </section>
  )
}
