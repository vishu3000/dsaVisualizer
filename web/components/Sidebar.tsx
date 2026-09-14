'use client'

import { useEffect, useState } from 'react'

import { PROBLEM_GROUPS } from '@/lib/problems.ts'

type SidebarProps = {
  current: string | null
  disabled: boolean
  onPick: (slug: string) => void
}

const STORAGE_KEY = 'dsa-visualizer:collapsed-groups'

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? 'chevron chevron-open' : 'chevron'}
      viewBox="0 0 12 12"
      width="9"
      height="9"
      aria-hidden="true"
    >
      <path d="M3 1.5L7.5 6L3 10.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function Sidebar({ current, disabled, onPick }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<string[]>([])

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) setCollapsed(JSON.parse(stored))
    } catch {
      // Storage is optional; every group simply stays open.
    }
  }, [])

  function toggle(label: string) {
    setCollapsed((current) => {
      const next = current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label]
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Ignore.
      }
      return next
    })
  }

  return (
    <nav className="sidebar" aria-label="Problems">
      <div className="sidebar-head">
        <span className="pane-label">Problems</span>
      </div>

      <div className="sidebar-body">
        {PROBLEM_GROUPS.map((group) => {
          const open = !collapsed.includes(group.label)
          const holdsCurrent = group.problems.some((problem) => problem.slug === current)

          return (
            <div className="sidebar-group" key={group.label}>
              <button
                type="button"
                className="sidebar-group-label"
                onClick={() => toggle(group.label)}
                aria-expanded={open}
              >
                <Chevron open={open} />
                <span>{group.label}</span>
                {/* A closed group still says it holds what is loaded. */}
                {!open && holdsCurrent && <span className="group-dot" />}
                <span className="group-count">{group.problems.length}</span>
              </button>

              {open &&
                group.problems.map((problem) => (
                  <button
                    key={problem.slug}
                    type="button"
                    className={problem.slug === current ? 'problem problem-current' : 'problem'}
                    onClick={() => onPick(problem.slug)}
                    disabled={disabled}
                    aria-current={problem.slug === current ? 'true' : undefined}
                  >
                    <span className="problem-title">{problem.title}</span>
                    <span className="problem-blurb">{problem.blurb}</span>
                  </button>
                ))}
            </div>
          )
        })}
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
