'use client'

import { fullText, toneOf } from '@/lib/format.ts'
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
          const outermost = position === frames.length - 1
          const locals = Object.entries(frame.locals)

          return (
            <div
              key={`${index}:${frame.fn}`}
              className={innermost ? 'frame-card frame-card-active' : 'frame-card'}
            >
              {/* A rail down the left so the frames read as one stack rather
                  than a list of unrelated cards. It stops at the module frame,
                  which nothing called. */}
              <div className="frame-rail">
                <span className="frame-depth">{index}</span>
                {!outermost && <span className="frame-thread" aria-hidden="true" />}
              </div>

              <div className="frame-main">
                <div className="frame-id">
                  <span className="frame-fn">{frame.fn}</span>
                  <span className="frame-line">line {frame.line}</span>
                  {innermost && <span className="frame-tag">running</span>}
                </div>

                <div className="frame-locals">
                  {locals.length === 0 ? (
                    <span className="local-empty">no locals</span>
                  ) : (
                    locals.map(([name, val]) => {
                      const value = fullText(val, snapshot.heap)
                      return (
                        // Chips sit in a wrapping row, so a long value is
                        // ellipsed to keep one local from taking the whole
                        // card; the title carries the rest.
                        <span className="local-chip" key={name} title={`${name} = ${value}`}>
                          <span className="local-name">{name}</span>
                          <span className="local-eq">=</span>
                          <span className={`local-value tone-${toneOf(val)}`}>{value}</span>
                        </span>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )
        })}
    </div>
  )
}
