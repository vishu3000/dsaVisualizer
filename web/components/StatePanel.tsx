'use client'

import type { Snapshot } from '@/lib/trace/types.ts'

type StatePanelProps = {
  snapshot: Snapshot | null
  step: number
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: string
  children: React.ReactNode
}) {
  return (
    <section className="state-section">
      <header className="state-section-head">
        <h2 className="state-section-title">{title}</h2>
        {count !== undefined && <span className="state-section-count">{count}</span>}
      </header>
      {children}
    </section>
  )
}

export function StatePanel({ snapshot, step }: StatePanelProps) {
  if (!snapshot) {
    return (
      <div className="state-panel">
        <div className="pane-placeholder">no snapshot</div>
      </div>
    )
  }

  const frameCount = snapshot.stack.length
  const heapCount = Object.keys(snapshot.heap).length

  return (
    <div className="state-panel">
      <div className="state-meta">
        <span className={`event-badge event-${snapshot.event}`}>{snapshot.event}</span>
        <span className="state-meta-item">
          line <b>{snapshot.line}</b>
        </span>
        <span className="state-meta-item">
          index <b>{step}</b>
        </span>
      </div>

      <Section title="Stack" count={`${frameCount} frame${frameCount === 1 ? '' : 's'}`}>
        <pre className="json-dump">{JSON.stringify(snapshot.stack, null, 2)}</pre>
      </Section>

      <Section title="Heap" count={`${heapCount} object${heapCount === 1 ? '' : 's'}`}>
        <pre className="json-dump">{JSON.stringify(snapshot.heap, null, 2)}</pre>
      </Section>

      <Section title="Stdout">
        <pre className="json-dump stdout-dump">
          {snapshot.stdout === '' ? <span className="empty-note">(empty)</span> : snapshot.stdout}
        </pre>
      </Section>
    </div>
  )
}
