'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { CanvasPanel } from '@/components/CanvasPanel.tsx'
import { CodePane } from '@/components/CodePane.tsx'
import { Header } from '@/components/Header.tsx'
import { InspectorPanel } from '@/components/InspectorPanel.tsx'
import { SamplesModal } from '@/components/SamplesModal.tsx'
import { Splitter } from '@/components/Splitter.tsx'
import { TransportBar } from '@/components/TransportBar.tsx'
import { APP_NAME, documentTitle } from '@/lib/brand.ts'
import { PROBLEM_SLUGS, findProblem } from '@/lib/problems.ts'
import { encodeProblem, encodeSource, parseHash, writeHash } from '@/lib/share.ts'
import { BASE_INTERVAL_MS, usePlayer, usePreviousSnapshot, useSnapshot } from '@/lib/store.ts'
import { useLayout } from '@/lib/useLayout.ts'
import { useTransportKeys } from '@/lib/useTransportKeys.ts'

export default function Page() {
  const bodyRef = useRef<HTMLElement | null>(null)
  const rightRef = useRef<HTMLDivElement | null>(null)
  const { layout, update, reset } = useLayout()
  const [available, setAvailable] = useState<string[]>([])
  const [showSamples, setShowSamples] = useState(false)

  /** Fixtures present on disk, so hand-added ones appear without a code edit. */
  const refreshIndex = useCallback(() => {
    fetch(`fixtures/index.json?t=${Date.now()}`)
      .then((response) => response.json())
      .then((names: string[]) => setAvailable(names))
      .catch(() => setAvailable([]))
  }, [])

  const load = usePlayer((state) => state.load)
  const setSource = usePlayer((state) => state.setSource)
  const fixture = usePlayer((state) => state.fixture)
  const source = usePlayer((state) => state.source)
  const trace = usePlayer((state) => state.trace)
  const status = usePlayer((state) => state.status)
  const error = usePlayer((state) => state.error)
  const errorDetail = usePlayer((state) => state.errorDetail)
  const progress = usePlayer((state) => state.progress)
  const dirty = usePlayer((state) => state.dirty)
  const origin = usePlayer((state) => state.origin)
  const currentStep = usePlayer((state) => state.currentStep)
  const playing = usePlayer((state) => state.playing)
  const speed = usePlayer((state) => state.speed)
  const vizOverrides = usePlayer((state) => state.vizOverrides)

  const snapshot = useSnapshot()
  const previous = usePreviousSnapshot()
  const running = status === 'running'

  useTransportKeys()

  useEffect(() => {
    refreshIndex()
  }, [refreshIndex])

  useEffect(() => {
    const target = parseHash(window.location.hash)

    if (target?.kind === 'source') {
      const player = usePlayer.getState()
      player.setSource(target.source)
      void player.run()
      return
    }

    load(target?.kind === 'problem' ? target.slug : PROBLEM_SLUGS[0])
  }, [load])

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
  const loaded = dirty || origin === 'live' ? null : fixture
  const headerLabel = loaded ? (findProblem(loaded)?.title ?? loaded) : 'Scratch'

  // Before anything is loaded — which is the state the export is rendered in —
  // there is no problem to name, so the tab is just the app.
  const titleText = source === '' && !fixture ? APP_NAME : documentTitle(headerLabel)

  return (
    <div className="app">
      {/* React hoists this into <head>. Rendered rather than assigned in an
          effect: document.title set imperatively races head hydration on the
          first load and loses, leaving the tab on the bare app name. */}
      <title>{titleText}</title>

      <Header
        label={headerLabel}
        disabled={running}
        onSamples={() => {
          // The list is read from disk, so a fixture added since load shows up.
          refreshIndex()
          setShowSamples(true)
        }}
        onNew={() => usePlayer.getState().newScratch()}
      />

      <main
        className="body"
        ref={bodyRef}
        style={{ gridTemplateColumns: `${layout.editor}px 6px minmax(0, 1fr)` }}
      >
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

        <Splitter
          orientation="vertical"
          label="Resize source panel"
          containerRef={bodyRef}
          onDrag={(x) => update({ editor: x })}
          onNudge={(delta) => update({ editor: layout.editor + delta })}
        />

        <div
          className="right-column"
          ref={rightRef}
          style={{
            gridTemplateRows: `minmax(0, ${layout.canvas}fr) 6px minmax(0, ${
              1 - layout.canvas
            }fr)`,
          }}
        >
          <CanvasPanel
            snapshot={snapshot}
            previous={previous}
            trace={trace}
            progress={progress}
            running={running}
            error={status === 'error' ? error : null}
            errorDetail={status === 'error' ? errorDetail : null}
            overrides={vizOverrides}
            onRetarget={(name, kind) => usePlayer.getState().setVizOverride(name, kind)}
          />

          <Splitter
            orientation="horizontal"
            label="Resize visualization panel"
            containerRef={rightRef}
            onDrag={(y) => {
              const height = rightRef.current?.getBoundingClientRect().height ?? 1
              update({ canvas: y / height })
            }}
            onNudge={(delta) => {
              const height = rightRef.current?.getBoundingClientRect().height ?? 1
              update({ canvas: layout.canvas + delta / height })
            }}
          />

          <InspectorPanel
            snapshot={snapshot}
            trace={trace}
            step={currentStep}
            onSeek={(target) => usePlayer.getState().seek(target)}
          />
        </div>
      </main>

      <TransportBar onResetLayout={reset} />

      {showSamples && (
        <SamplesModal
          current={loaded}
          custom={available.filter((slug) => !PROBLEM_SLUGS.includes(slug))}
          onPick={(slug) => {
            load(slug)
            setShowSamples(false)
          }}
          onClose={() => setShowSamples(false)}
        />
      )}
    </div>
  )
}
