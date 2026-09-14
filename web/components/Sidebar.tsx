'use client'

import { PROBLEM_GROUPS } from '@/lib/problems.ts'

type SidebarProps = {
  current: string | null
  disabled: boolean
  onPick: (slug: string) => void
}

export function Sidebar({ current, disabled, onPick }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Problems">
      <div className="sidebar-head">
        <span className="pane-label">Problems</span>
      </div>

      <div className="sidebar-body">
        {PROBLEM_GROUPS.map((group) => (
          <div className="sidebar-group" key={group.label}>
            <div className="sidebar-group-label">{group.label}</div>
            {group.problems.map((problem) => (
              <button
                key={problem.slug}
                type="button"
                className={
                  problem.slug === current ? 'problem problem-current' : 'problem'
                }
                onClick={() => onPick(problem.slug)}
                disabled={disabled}
                aria-current={problem.slug === current ? 'true' : undefined}
              >
                <span className="problem-title">{problem.title}</span>
                <span className="problem-blurb">{problem.blurb}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-foot">
        <span className="key-hint">
          <kbd>←</kbd>
          <kbd>→</kbd> step
        </span>
        <span className="key-hint">
          <kbd>space</kbd> play
        </span>
        <span className="key-hint">
          <kbd>⌘↵</kbd> run
        </span>
      </div>
    </nav>
  )
}
