'use client'

type HeaderProps = {
  /** What is loaded right now, shown beside the title. */
  label: string
  disabled: boolean
  onSamples: () => void
  onNew: () => void
}

function GridIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="0" y="0" width="5" height="5" rx="1" />
      <rect x="7" y="0" width="5" height="5" rx="1" />
      <rect x="0" y="7" width="5" height="5" rx="1" />
      <rect x="7" y="7" width="5" height="5" rx="1" />
    </svg>
  )
}

export function Header({ label, disabled, onSamples, onNew }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">DSA Visualizer</span>
        <span className="brand-sep" aria-hidden="true">
          /
        </span>
        <span className="brand-context">{label}</span>
      </div>

      <div className="header-actions">
        <button
          type="button"
          className="header-button"
          onClick={onSamples}
          disabled={disabled}
          title="Browse the recorded samples"
        >
          <GridIcon />
          Samples
        </button>

        <button
          type="button"
          className="header-button header-button-accent"
          onClick={onNew}
          disabled={disabled}
          title="Start from a blank buffer"
        >
          New +
        </button>
      </div>
    </header>
  )
}
