'use client'

import { useState } from 'react'

import type { Snapshot } from '@/lib/trace/types.ts'

type Tab = 'stack' | 'stdout'

export function InspectorPanel({ snapshot }: { snapshot: Snapshot | null }) {
  const [tab, setTab] = useState<Tab>('stack')

  const frames = snapshot?.stack ?? []
  const stdout = snapshot?.stdout ?? ''
  const stdoutLines = stdout === '' ? 0 : stdout.replace(/\n$/, '').split('\n').length

  return (
    <section className="inspector">
      <div className="inspector-head">
        <div className="tabs">
          <button
            type="button"
            className={`tab${tab === 'stack' ? ' tab-active' : ''}`}
            onClick={() => setTab('stack')}
          >
            Call Stack <span className="tab-count">{frames.length}</span>
          </button>
          <button
            type="button"
            className={`tab${tab === 'stdout' ? ' tab-active' : ''}`}
            onClick={() => setTab('stdout')}
          >
            Stdout <span className="tab-count">{stdoutLines}</span>
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
          // Innermost frame last in the trace; show it first, and mark it active.
          [...frames].reverse().map((frame, index) => (
            <div
              key={`${frames.length - 1 - index}:${frame.fn}`}
              className={`json-card${index === 0 ? ' json-card-active' : ''}`}
              style={{ marginBottom: 7 }}
            >
              <pre className="json-dump">{JSON.stringify(frame, null, 2)}</pre>
            </div>
          ))
        ) : stdout === '' ? (
          <div className="empty-state">
            <span className="empty-title">No output yet</span>
            <span className="empty-note">Nothing has been printed at this step.</span>
          </div>
        ) : (
          <div className="json-card">
            <pre className="json-dump">{stdout}</pre>
          </div>
        )}
      </div>
    </section>
  )
}
