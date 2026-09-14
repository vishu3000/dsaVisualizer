'use client'

import { formatVal, toneOf } from '@/lib/format.ts'
import type { Snapshot } from '@/lib/trace/types.ts'

/** Frames innermost-first: the frame that is executing reads first. */
export function CallStackView({ snapshot }: { snapshot: Snapshot }) {
  const frames = snapshot.stack

  if (frames.length === 0) {
    return <div className="list-empty">no frames</div>
  }

  return (
    <div className="frames">
      {frames
        .map((frame, index) => ({ frame, index }))
        .reverse()
        .map(({ frame, index }, position) => {
          const innermost = position === 0
          const locals = Object.entries(frame.locals)

          return (
            <div
              key={`${index}:${frame.fn}`}
              className={innermost ? 'frame-card frame-card-active' : 'frame-card'}
            >
              <div className="frame-id">
                <span className={innermost ? 'frame-badge frame-badge-active' : 'frame-badge'}>
                  #{index}
                </span>
                <span className="frame-fn">{frame.fn}</span>
                <span className="frame-line">:{frame.line}</span>
              </div>

              <div className="frame-locals">
                {locals.length === 0 ? (
                  <span className="local-empty">no locals</span>
                ) : (
                  locals.map(([name, val]) => (
                    <span className="local-chip" key={name}>
                      {name}{' '}
                      <span className={`local-value tone-${toneOf(val)}`}>
                        {formatVal(val, snapshot.heap)}
                      </span>
                    </span>
                  ))
                )}
              </div>
            </div>
          )
        })}
    </div>
  )
}
