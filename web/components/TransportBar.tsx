'use client'

import { SPEEDS, usePlayer } from '@/lib/store.ts'
import { StatusPill } from '@/components/StatusPill.tsx'

// Icon geometry is taken from the design file's transport bar.
function StepBackIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 5v14l-11-7z" />
      <rect x="4" y="5" width="2.6" height="14" rx="1.2" />
    </svg>
  )
}

function StepForwardIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 5v14l11-7z" />
      <rect x="17.4" y="5" width="2.6" height="14" rx="1.2" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 4l13 8-13 8z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="4" width="4.4" height="16" rx="1.4" />
      <rect x="13.6" y="4" width="4.4" height="16" rx="1.4" />
    </svg>
  )
}

export function TransportBar({ onResetLayout }: { onResetLayout?: () => void }) {
  const trace = usePlayer((state) => state.trace)
  const currentStep = usePlayer((state) => state.currentStep)
  const playing = usePlayer((state) => state.playing)
  const speed = usePlayer((state) => state.speed)
  const stepBy = usePlayer((state) => state.stepBy)
  const seek = usePlayer((state) => state.seek)
  const togglePlaying = usePlayer((state) => state.togglePlaying)
  const setSpeed = usePlayer((state) => state.setSpeed)
  const run = usePlayer((state) => state.run)
  const status = usePlayer((state) => state.status)
  const source = usePlayer((state) => state.source)

  const running = status === 'running'
  const total = trace?.meta.steps ?? 0
  const last = Math.max(0, total - 1)
  const ready = total > 0
  const progress = last > 0 ? (currentStep / last) * 100 : 0

  return (
    <div className={`transport${ready ? '' : ' transport-idle'}`}>
      <button
        type="button"
        className="run-button"
        onClick={() => run()}
        disabled={running || source.trim() === ''}
        title="Run the editor's code (Cmd/Ctrl + Enter)"
      >
        {running ? 'Running…' : 'Run'} <span className="run-chord">⌘↵</span>
      </button>

      <StatusPill />

      <span className="transport-divider" />

      <div className="transport-buttons">
        <button
          type="button"
          className="tbutton"
          onClick={() => stepBy(-1)}
          disabled={!ready || currentStep === 0}
          title="Step back"
          aria-label="Step back"
        >
          <StepBackIcon />
        </button>

        <button
          type="button"
          className="tbutton tbutton-play"
          onClick={togglePlaying}
          disabled={!ready}
          title={playing ? 'Pause' : 'Play'}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        <button
          type="button"
          className="tbutton"
          onClick={() => stepBy(1)}
          disabled={!ready || currentStep >= last}
          title="Step forward"
          aria-label="Step forward"
        >
          <StepForwardIcon />
        </button>
      </div>

      <select
        className="speed-select"
        value={speed}
        onChange={(event) => setSpeed(Number(event.target.value))}
        disabled={!ready}
        aria-label="Playback speed"
      >
        {SPEEDS.map((option) => (
          <option key={option} value={option}>
            {option.toFixed(option < 1 ? 2 : 1)}×
          </option>
        ))}
      </select>

      <div className="transport-track">
        <input
          type="range"
          className="scrubber"
          min={0}
          max={last}
          step={1}
          value={currentStep}
          onChange={(event) => seek(Number(event.target.value))}
          disabled={!ready}
          aria-label="Scrub to step"
          style={
            {
              // A range input cannot paint a filled track on its own.
              '--scrub-fill': `linear-gradient(to right, var(--exec) ${progress}%, var(--track) ${progress}%)`,
            } as React.CSSProperties
          }
        />

        <span className={`readout${ready ? '' : ' readout-off'}`}>
          {ready ? (
            <>
              step <span className="readout-current">{(currentStep + 1).toLocaleString()}</span>{' '}
              <span className="readout-slash">/</span> {total.toLocaleString()}
            </>
          ) : (
            <>
              step — <span className="readout-slash">/</span> —
            </>
          )}
        </span>
      </div>

      {onResetLayout && (
        <button
          type="button"
          className="layout-reset"
          onClick={onResetLayout}
          title="Reset panel sizes"
        >
          reset layout
        </button>
      )}
    </div>
  )
}
