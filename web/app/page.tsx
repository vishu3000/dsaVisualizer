'use client'

import { useEffect, useRef } from 'react'

import { CanvasPanel } from '@/components/CanvasPanel.tsx'
import { CodePane } from '@/components/CodePane.tsx'
import { InspectorPanel } from '@/components/InspectorPanel.tsx'
import { Sidebar } from '@/components/Sidebar.tsx'
import { Splitter } from '@/components/Splitter.tsx'
import { TransportBar } from '@/components/TransportBar.tsx'
import { PROBLEM_SLUGS } from '@/lib/problems.ts'
import { encodeProblem, encodeSource, parseHash, writeHash } from '@/lib/share.ts'
import { BASE_INTERVAL_MS, usePlayer, usePreviousSnapshot, useSnapshot } from '@/lib/store.ts'
import { useLayout } from '@/lib/useLayout.ts'
import { useTransportKeys } from '@/lib/useTransportKeys.ts'

export default function Page() {
  const bodyRef = useRef<HTMLElement | null>(null)
  const rightRef = useRef<HTMLDivElement | null>(null)
  const { layout, update, reset } = useLayout()

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

  const snapshot = useSnapshot()
  const previous = usePreviousSnapshot()
  const running = status === 'running'

  useTransportKeys()

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

  return (
    <div className="app">
      <main
        className="body"
        ref={bodyRef}
        style={{
          gridTemplateColumns: `${layout.sidebar}px 6px ${layout.editor}px 6px minmax(0, 1fr)`,
        }}
      >
        <Sidebar
          current={dirty || origin === 'live' ? null : fixture}
          disabled={running}
          onPick={(slug) => load(slug)}
        />

        <Splitter
          orientation="vertical"
          label="Resize problems panel"
          containerRef={bodyRef}
          onDrag={(x) => update({ sidebar: x })}
          onNudge={(delta) => update({ sidebar: layout.sidebar + delta })}
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

        <Splitter
          orientation="vertical"
          label="Resize source panel"
          containerRef={bodyRef}
          onDrag={(x) => update({ editor: x - layout.sidebar - 6 })}
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
    </div>
  )
}
