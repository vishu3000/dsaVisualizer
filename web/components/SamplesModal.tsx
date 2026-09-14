'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { PROBLEM_GROUPS, type Problem, type ProblemGroup } from '@/lib/problems.ts'

type SamplesModalProps = {
  /** The loaded fixture, or null when the editor holds unsaved code. */
  current: string | null
  /** Fixtures on disk that are not in the seeded catalogue. */
  custom: string[]
  onPick: (slug: string) => void
  onClose: () => void
}

function matches(problem: Problem, needle: string): boolean {
  if (needle === '') return true
  const haystack = `${problem.slug} ${problem.title} ${problem.blurb}`.toLowerCase()
  return haystack.includes(needle)
}

export function SamplesModal({ current, custom, onPick, onClose }: SamplesModalProps) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const groups: ProblemGroup[] = useMemo(() => {
    const mine: ProblemGroup[] =
      custom.length === 0
        ? []
        : [
            {
              label: 'Mine',
              problems: custom.map((slug) => ({
                slug,
                title: slug,
                blurb: `fixtures/${slug}.json`,
              })),
            },
          ]
    return [...PROBLEM_GROUPS, ...mine]
  }, [custom])

  const needle = query.trim().toLowerCase()

  const shown = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          problems: group.problems.filter((problem) => matches(problem, needle)),
        }))
        .filter((group) => group.problems.length > 0),
    [groups, needle],
  )

  const total = shown.reduce((count, group) => count + group.problems.length, 0)
  const first = shown[0]?.problems[0]

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Samples"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-title">Samples</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="samples-search">
          <input
            ref={searchRef}
            className="field-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter runs the obvious choice rather than making you reach for
              // the mouse after typing a filter.
              if (event.key === 'Enter' && first) onPick(first.slug)
            }}
            placeholder="Filter by name…"
            spellCheck={false}
            aria-label="Filter samples"
          />
          <span className="samples-count">
            {total} of {groups.reduce((count, group) => count + group.problems.length, 0)}
          </span>
        </div>

        <div className="modal-body samples-body">
          {shown.map((group) => (
            <div className="samples-group" key={group.label}>
              <div className="samples-group-label">
                <span>{group.label}</span>
                <span className="group-count">{group.problems.length}</span>
              </div>

              <div className="samples-grid">
                {group.problems.map((problem) => (
                  <button
                    key={problem.slug}
                    type="button"
                    className={
                      problem.slug === current ? 'problem problem-current' : 'problem'
                    }
                    onClick={() => onPick(problem.slug)}
                    aria-current={problem.slug === current ? 'true' : undefined}
                  >
                    <span className="problem-title">{problem.title}</span>
                    <span className="problem-blurb">{problem.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {total === 0 && <div className="samples-empty">Nothing matches “{query.trim()}”.</div>}
        </div>

        <div className="modal-foot">
          <span className="modal-foot-note">Loading a sample replaces whatever is in the editor.</span>

          <div className="samples-hints">
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
        </div>
      </div>
    </div>
  )
}
