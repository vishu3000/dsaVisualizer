'use client'

import { useEffect, useState } from 'react'

import { CodePane } from '@/components/CodePane.tsx'
import { StatePanel } from '@/components/StatePanel.tsx'
import { TransportBar } from '@/components/TransportBar.tsx'
import { BASE_INTERVAL_MS, usePlayer, useSnapshot } from '@/lib/store.ts'

export default function Page() {
  const [fixtures, setFixtures] = useState<string[]>([])

  const load = usePlayer((state) => state.load)
  const fixture = usePlayer((state) => state.fixture)
  const status = usePlayer((state) => state.status)
  const error = usePlayer((state) => state.error)
  const source = usePlayer((state) => state.source)
  const currentStep = usePlayer((state) => state.currentStep)
  const playing = usePlayer((state) => state.playing)
  const speed = usePlayer((state) => state.speed)
  const trace = usePlayer((state) => state.trace)

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

  const truncated = trace?.meta.truncated ?? false
  const traceError = trace?.meta.error

  return (
    <div className="app">
      <header className="chrome">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">DSA Visualizer</span>
        </div>

        <label className="fixture-picker">
          <span className="fixture-label">trace</span>
          <select
            className="fixture-select"
            value={fixture ?? ''}
            onChange={(event) => load(event.target.value)}
            disabled={fixtures.length === 0}
            aria-label="Fixture"
          >
            {fixtures.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <div className="chrome-status">
          {status === 'loading' && <span className="status-note">loading…</span>}
          {status === 'error' && <span className="status-error">load failed: {error}</span>}
          {status === 'ready' && truncated && (
            <span className="status-warn">truncated at step cap</span>
          )}
          {status === 'ready' && traceError && (
            <span className="status-error">
              {traceError.type} on line {traceError.line}
            </span>
          )}
        </div>
      </header>

      <main className="split">
        <section className="pane pane-code">
          <div className="pane-head">
            <span className="pane-title">{fixture ? `${fixture}.py` : 'source'}</span>
            <span className="pane-note">read-only</span>
          </div>
          <div className="pane-body">
            {source ? (
              <CodePane source={source} line={snapshot?.line ?? 0} />
            ) : (
              <div className="pane-placeholder">no source</div>
            )}
          </div>
        </section>

        <section className="pane pane-state">
          <div className="pane-head">
            <span className="pane-title">snapshot</span>
            <span className="pane-note">reconstructed</span>
          </div>
          <div className="pane-body pane-body-scroll">
            <StatePanel snapshot={snapshot} step={currentStep} />
          </div>
        </section>
      </main>

      <TransportBar />
    </div>
  )
}
