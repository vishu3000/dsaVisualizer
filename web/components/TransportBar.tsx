'use client'

import { SPEEDS, usePlayer } from '@/lib/store.ts'

function StepBackIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M12.5 3.5v9L6 8l6.5-4.5z" fill="currentColor" />
      <rect x="3.5" y="3.5" width="1.6" height="9" fill="currentColor" />
    </svg>
  )
}

function StepForwardIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3.5 3.5v9L10 8 3.5 3.5z" fill="currentColor" />
      <rect x="10.9" y="3.5" width="1.6" height="9" fill="currentColor" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M4.5 2.8v10.4L13 8 4.5 2.8z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <rect x="4" y="3" width="3" height="10" fill="currentColor" />
      <rect x="9" y="3" width="3" height="10" fill="currentColor" />
    </svg>
  )
}

export function TransportBar() {
  const trace = usePlayer((state) => state.trace)
  const currentStep = usePlayer((state) => state.currentStep)
  const playing = usePlayer((state) => state.playing)
  const speed = usePlayer((state) => state.speed)
  const stepBy = usePlayer((state) => state.stepBy)
  const seek = usePlayer((state) => state.seek)
  const togglePlaying = usePlayer((state) => state.togglePlaying)
  const setSpeed = usePlayer((state) => state.setSpeed)

  const total = trace?.meta.steps ?? 0
  const last = Math.max(0, total - 1)
  const ready = total > 0

  return (
    <div className="transport">
      <div className="transport-buttons">
        <button
          type="button"
          className="transport-button"
          onClick={() => stepBy(-1)}
          disabled={!ready || currentStep === 0}
          title="Step back"
          aria-label="Step back"
        >
          <StepBackIcon />
        </button>

        <button
          type="button"
          className="transport-button transport-button-play"
          onClick={togglePlaying}
          disabled={!ready}
          title={playing ? 'Pause' : 'Play'}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        <button
          type="button"
          className="transport-button"
          onClick={() => stepBy(1)}
          disabled={!ready || currentStep >= last}
          title="Step forward"
          aria-label="Step forward"
        >
          <StepForwardIcon />
        </button>
      </div>

      <label className="speed">
        <span className="speed-label">speed</span>
        <select
          className="speed-select"
          value={speed}
          onChange={(event) => setSpeed(Number(event.target.value))}
          disabled={!ready}
          aria-label="Playback speed"
        >
          {SPEEDS.map((option) => (
            <option key={option} value={option}>
              {option}×
            </option>
          ))}
        </select>
      </label>

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
      />

      <div className="step-readout">
        {ready ? (
          <>
            step <span className="step-current">{(currentStep + 1).toLocaleString()}</span>
            <span className="step-sep">/</span>
            <span className="step-total">{total.toLocaleString()}</span>
          </>
        ) : (
          <span className="step-idle">no trace</span>
        )}
      </div>
    </div>
  )
}
