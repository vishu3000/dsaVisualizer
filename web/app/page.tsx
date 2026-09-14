'use client'

import { useEffect, useState } from 'react'

import { CanvasPanel } from '@/components/CanvasPanel.tsx'
import { CodePane } from '@/components/CodePane.tsx'
import { InspectorPanel } from '@/components/InspectorPanel.tsx'
import { Sidebar } from '@/components/Sidebar.tsx'
import { TransportBar } from '@/components/TransportBar.tsx'
import { PROBLEM_SLUGS } from '@/lib/problems.ts'
import { encodeProblem, encodeSource, parseHash, writeHash } from '@/lib/share.ts'
import { BASE_INTERVAL_MS, usePlayer, usePreviousSnapshot, useSnapshot } from '@/lib/store.ts'
import { useTransportKeys } from '@/lib/useTransportKeys.ts'

function StatusPill() {
  const status = usePlayer((state) => state.status)
  const error = usePlayer((state) => state.error)
  const trace = usePlayer((state) => state.trace)
  const origin = usePlayer((state) => state.origin)
  const progress = usePlayer((state) => state.progress)

  if (status === 'running') {
    return (
      <span className="pill pill-ready">
        <span className="pill-dot pill-dot-pulse" />
        {progress?.phase === 'running' ? 'tracing' : 'starting python'}
      </span>
    )
  }
  if (status === 'loading') return <span className="pill">loading</span>
  if (status === 'error') {
    return (
      <span className="pill pill-error">
        <span className="pill-dot" />
        {error}
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
      {origin === 'live' ? 'traced' : 'fixture'}
    </span>
  )
}

export default function Page() {
  const [fixtures, setFixtures] = useState<string[]>([])

  const load = usePlayer((state) => state.load)
  const run = usePlayer((state) => state.run)
  const setSource = usePlayer((state) => state.setSource)
  const fixture = usePlayer((state) => state.fixture)
  const source = usePlayer((state) => state.source)
  const trace = usePlayer((state) => state.trace)
  const status = usePlayer((state) => state.status)
  const error = usePlayer((state) => state.error)
  const errorDetail = usePlayer((state) => state.errorDetail)
  const progress = usePlayer((state) => state.progress)
  const elapsedMs = usePlayer((state) => state.elapsedMs)
  const dirty = usePlayer((state) => state.dirty)
  const origin = usePlayer((state) => state.origin)
  const currentStep = usePlayer((state) => state.currentStep)
  const playing = usePlayer((state) => state.playing)
  const speed = usePlayer((state) => state.speed)

  const snapshot = useSnapshot()
  const previous = usePreviousSnapshot()
  const running = status === 'running'

  useTransportKeys()

  // Boot: a shared link wins over the default problem. Shared source is
  // re-executed rather than shipped with a trace, so links stay short.
  useEffect(() => {
    fetch('fixtures/index.json')
      .then((response) => response.json())
      .then((names: string[]) => setFixtures(names))
      .catch(() => setFixtures([]))

    const target = parseHash(window.location.hash)

    if (target?.kind === 'source') {
      const player = usePlayer.getState()
      player.setSource(target.source)
      void player.run()
      return
    }

    load(target?.kind === 'problem' ? target.slug : PROBLEM_SLUGS[0])
  }, [load])

  // Keep the address bar shareable: the slug while a problem is untouched, the
  // compressed source once it has been edited or run.
  useEffect(() => {
    if (status === 'running' || status === 'loading') return
    if (source === '') return

    const id = setTimeout(() => {
      writeHash(dirty || origin === 'live' ? encodeSource(source) : encodeProblem(fixture ?? ''))
    }, 400)
    return () => clearTimeout(id)
  }, [source, dirty, origin, fixture, status])

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
            disabled={fixtures.length === 0 || running}
            aria-label="Trace"
          >
            {/* Shared code belongs to no fixture; say so rather than letting
                the select imply the first one is loaded. */}
            {fixture === null && (
              <option value="" disabled>
                custom code
              </option>
            )}
            {fixtures.map((name) => (
              <option key={name} value={name}>
                {name}.py
              </option>
            ))}
          </select>
          {dirty && <span className="dirty-mark">edited</span>}
        </div>

        <div className="titlebar-right">
          {trace && !running && (
            <span className="step-meta">
              {trace.meta.steps.toLocaleString()} steps
              {elapsedMs !== null && ` · ${(elapsedMs / 1000).toFixed(1)}s`}
            </span>
          )}
          <StatusPill />
          <button
            type="button"
            className="run-button"
            onClick={() => run()}
            disabled={running || source.trim() === ''}
          >
            {running ? 'Running…' : 'Run'} <span className="run-chord">⌘↵</span>
          </button>
        </div>
      </header>

      <main className="body">
        <Sidebar
          current={dirty || origin === 'live' ? null : fixture}
          disabled={running}
          onPick={(slug) => load(slug)}
        />

        <section className="editor">
          <div className="pane-head">
            <span className="pane-label">Source</span>
            <span className="pane-meta">python · {lineCount} lines</span>
          </div>
          <div className="editor-body">
            <CodePane
              source={source}
              line={snapshot?.line ?? 0}
              onChange={setSource}
              onRun={() => usePlayer.getState().run()}
            />
          </div>
        </section>

        <div className="right-column">
          <CanvasPanel
            snapshot={snapshot}
            previous={previous}
            trace={trace}
            progress={progress}
            running={running}
            error={status === 'error' ? error : null}
            errorDetail={status === 'error' ? errorDetail : null}
          />
          <InspectorPanel
            snapshot={snapshot}
            trace={trace}
            step={currentStep}
            onSeek={(target) => usePlayer.getState().seek(target)}
          />
        </div>
      </main>

      <TransportBar />
    </div>
  )
}
