'use client'

import { useEffect, useState } from 'react'

import { CanvasPanel } from '@/components/CanvasPanel.tsx'
import { CodePane } from '@/components/CodePane.tsx'
import { InspectorPanel } from '@/components/InspectorPanel.tsx'
import { TransportBar } from '@/components/TransportBar.tsx'
import { BASE_INTERVAL_MS, usePlayer, useSnapshot } from '@/lib/store.ts'

function StatusPill() {
  const status = usePlayer((state) => state.status)
  const error = usePlayer((state) => state.error)
  const trace = usePlayer((state) => state.trace)

  if (status === 'loading') return <span className="pill">loading</span>
  if (status === 'error') {
    return (
      <span className="pill pill-error">
        <span className="pill-dot" />
        load failed · {error}
      </span>
    )
  }
  if (status !== 'ready' || !trace) return <span className="pill">idle</span>

  if (trace.meta.error) {
    return (
      <span className="pill pill-error">
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
      ready
    </span>
  )
}

export default function Page() {
  const [fixtures, setFixtures] = useState<string[]>([])

  const load = usePlayer((state) => state.load)
  const fixture = usePlayer((state) => state.fixture)
  const source = usePlayer((state) => state.source)
  const trace = usePlayer((state) => state.trace)
  const playing = usePlayer((state) => state.playing)
  const speed = usePlayer((state) => state.speed)

  const snapshot = useSnapshot()

  useEffect(() => {
    fetch('fixtures/index.json')
      .then((response) => response.json())
      .then((names: string[]) => {
        setFixtures(names)
        if (names.length > 0) load(names[0])
      })
      .catch(() => setFixtures([]))
  }, [load])

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => usePlayer.getState().stepBy(1), BASE_INTERVAL_MS / speed)
    return () => clearInterval(id)
  }, [playing, speed])

  const lineCount = source === '' ? 0 : source.replace(/\n$/, '').split('\n').length

  return (
    <div className="app">
      <header className="titlebar">
        <div className="titlebar-left">
          <span className="brand">
            <span className="brand-mark" />
            trace
          </span>
          <span className="titlebar-divider" />
          <select
            className="fixture-select"
            value={fixture ?? ''}
            onChange={(event) => load(event.target.value)}
            disabled={fixtures.length === 0}
            aria-label="Trace"
          >
            {fixtures.map((name) => (
              <option key={name} value={name}>
                {name}.py
              </option>
            ))}
          </select>
        </div>

        <div className="titlebar-right">
          {trace && (
            <span className="step-meta">
              {trace.meta.steps.toLocaleString()} steps · {trace.deltas.length.toLocaleString()}{' '}
              deltas
            </span>
          )}
          <StatusPill />
        </div>
      </header>

      <main className="body">
        <section className="editor">
          <div className="pane-head">
            <span className="pane-label">Source</span>
            <span className="pane-meta">python · {lineCount} lines</span>
          </div>
          <div className="editor-body">
            {source ? (
              <CodePane source={source} line={snapshot?.line ?? 0} />
            ) : (
              <div className="empty-state">
                <span className="empty-title">No source</span>
              </div>
            )}
          </div>
        </section>

        <div className="right-column">
          <CanvasPanel snapshot={snapshot} trace={trace} />
          <InspectorPanel snapshot={snapshot} />
        </div>
      </main>

      <TransportBar />
    </div>
  )
}
