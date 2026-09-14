'use client'

import { PROGRESS_LABELS, type ProgressPhase, type ProgressResponse } from '@/lib/pyodide/messages.ts'

const ORDER: ProgressPhase[] = ['boot', 'runtime', 'tracer', 'running']

export function RunProgress({ progress }: { progress: ProgressResponse | null }) {
  const activeIndex = progress ? ORDER.indexOf(progress.phase) : -1

  return (
    <div className="run-progress">
      <div className="run-progress-head">
        <span className="run-progress-title">{progress?.message ?? PROGRESS_LABELS.boot}</span>
        <span className="run-progress-note">first run downloads the runtime · later runs reuse it</span>
      </div>

      <div className="run-progress-bar">
        <span className="run-progress-fill" />
      </div>

      <ol className="run-progress-steps">
        {ORDER.map((phase, index) => (
          <li
            key={phase}
            className={
              index < activeIndex
                ? 'run-step run-step-done'
                : index === activeIndex
                  ? 'run-step run-step-active'
                  : 'run-step'
            }
          >
            <span className="run-step-dot" />
            {PROGRESS_LABELS[phase]}
          </li>
        ))}
      </ol>
    </div>
  )
}
