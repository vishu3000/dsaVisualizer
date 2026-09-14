'use client'

import { useEffect, useRef, useState } from 'react'

import {
  canWriteToDisk,
  saveFixture,
  validateSlug,
  type FixtureDraft,
} from '@/lib/fixtureFiles.ts'
import { CATEGORY_LABELS, PROBLEM_GROUPS } from '@/lib/problems.ts'
import { PROGRESS_LABELS } from '@/lib/pyodide/messages.ts'
import { RunFailure, runSource } from '@/lib/runner.ts'
import type { Trace } from '@/lib/trace/types.ts'

const NEW_CATEGORY = '__new__'

type ModalProps = {
  /** Prefilled from the editor, so "capture what I have" is one click. */
  initialSource: string
  taken: string[]
  onClose: () => void
  onSaved: (slug: string) => void
}

type Phase =
  | { stage: 'editing' }
  | { stage: 'tracing'; message: string }
  | { stage: 'traced'; trace: Trace }
  | { stage: 'saving' }
  | { stage: 'failed'; message: string; detail?: string }

export function NewFixtureModal({ initialSource, taken, onClose, onSaved }: ModalProps) {
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [blurb, setBlurb] = useState('')
  const [category, setCategory] = useState(CATEGORY_LABELS[0] ?? NEW_CATEGORY)
  const [newCategory, setNewCategory] = useState('')
  const [source, setSource] = useState(initialSource)
  const [phase, setPhase] = useState<Phase>({ stage: 'editing' })
  const [note, setNote] = useState<string | null>(null)
  const slugRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    slugRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const creatingCategory = category === NEW_CATEGORY
  const resolvedCategory = creatingCategory ? newCategory.trim() : category

  const slugError = slug === '' ? null : validateSlug(slug, taken)
  const categoryError =
    creatingCategory && newCategory.trim() === '' ? 'Name the new category.' : null

  const ready =
    slug !== '' && !slugError && !categoryError && source.trim() !== '' && title.trim() !== ''

  async function trace() {
    setNote(null)
    setPhase({ stage: 'tracing', message: PROGRESS_LABELS.boot })
    try {
      const result = await runSource(source, {
        onProgress: (progress) => setPhase({ stage: 'tracing', message: progress.message }),
      })
      setPhase({ stage: 'traced', trace: result })
    } catch (cause) {
      const failure = cause instanceof RunFailure ? cause : null
      setPhase({
        stage: 'failed',
        message: failure?.message ?? String(cause),
        detail: failure?.detail,
      })
    }
  }

  async function save() {
    if (phase.stage !== 'traced') return
    const draft: FixtureDraft = {
      slug,
      title: title.trim(),
      blurb: blurb.trim() || 'added from the app',
      category: resolvedCategory,
      source,
      trace: phase.trace,
    }

    const traced = phase.trace
    setPhase({ stage: 'saving' })
    const outcome = await saveFixture(draft, PROBLEM_GROUPS)

    if (outcome.status === 'saved') {
      onSaved(slug)
      return
    }

    setPhase({ stage: 'traced', trace: traced })
    setNote(
      outcome.status === 'cancelled' ? 'Save cancelled — nothing written.' : outcome.message,
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="New fixture"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <span className="modal-title">New fixture</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="field-row">
            <label className="field">
              <span className="field-label">File name</span>
              <input
                ref={slugRef}
                className="field-input"
                value={slug}
                onChange={(event) => setSlug(event.target.value.trim())}
                placeholder="merge_sort"
                spellCheck={false}
              />
              <span className="field-note">
                {slugError ? (
                  <span className="field-error">{slugError}</span>
                ) : (
                  <code>fixtures/{slug || '<name>'}.json</code>
                )}
              </span>
            </label>

            <label className="field">
              <span className="field-label">Title</span>
              <input
                className="field-input"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Merge sort"
              />
              <span className="field-note">shown in the sidebar</span>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Category</span>
              <select
                className="field-input"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {CATEGORY_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
                <option value={NEW_CATEGORY}>+ New category…</option>
              </select>
              <span className="field-note">
                {creatingCategory ? 'added beside the existing ones' : 'existing category'}
              </span>
            </label>

            <label className="field">
              <span className="field-label">
                {creatingCategory ? 'New category name' : 'Description'}
              </span>
              {creatingCategory ? (
                <input
                  className="field-input"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="Sorting"
                />
              ) : (
                <input
                  className="field-input"
                  value={blurb}
                  onChange={(event) => setBlurb(event.target.value)}
                  placeholder="divide, sort halves, merge back"
                />
              )}
              <span className="field-note">
                {categoryError ? (
                  <span className="field-error">{categoryError}</span>
                ) : creatingCategory ? (
                  'one line, sentence case'
                ) : (
                  'one line under the title'
                )}
              </span>
            </label>
          </div>

          {creatingCategory && (
            <label className="field">
              <span className="field-label">Description</span>
              <input
                className="field-input"
                value={blurb}
                onChange={(event) => setBlurb(event.target.value)}
                placeholder="divide, sort halves, merge back"
              />
            </label>
          )}

          <label className="field field-grow">
            <span className="field-label">Python source</span>
            <textarea
              className="field-code"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
              rows={12}
            />
            <span className="field-note">
              Add <code># @viz stack items</code> style hints to pick renderers.
            </span>
          </label>

          {phase.stage === 'tracing' && (
            <div className="modal-status">
              <span className="pill pill-ready">
                <span className="pill-dot pill-dot-pulse" />
                {phase.message}
              </span>
            </div>
          )}

          {phase.stage === 'failed' && (
            <div className="error-card">
              <div className="error-title">{phase.message}</div>
              {phase.detail && <div className="error-body">{phase.detail}</div>}
            </div>
          )}

          {phase.stage === 'traced' && (
            <div className="modal-result">
              <span className="pill pill-ready">
                <span className="pill-dot" />
                traced · {phase.trace.meta.steps.toLocaleString()} steps
              </span>
              {phase.trace.meta.error && (
                <span className="pill pill-error">
                  <span className="pill-dot" />
                  halted · {phase.trace.meta.error.type}
                </span>
              )}
              <span className="modal-hints">
                will be filed under {resolvedCategory || '…'}
              </span>
            </div>
          )}

          {note && <div className="modal-note">{note}</div>}
        </div>

        <div className="modal-foot">
          <span className="modal-foot-note">
            {canWriteToDisk()
              ? 'Save writes the trace, the source and the catalogue entry. Pick the repository root when asked.'
              : 'This browser cannot write files. Use Chrome or Edge to save.'}
          </span>

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>

            {phase.stage === 'traced' || phase.stage === 'saving' ? (
              <button
                type="button"
                className="run-button"
                onClick={save}
                disabled={!canWriteToDisk() || phase.stage === 'saving'}
              >
                {phase.stage === 'saving' ? 'Saving…' : 'Save'}
              </button>
            ) : (
              <button
                type="button"
                className="run-button"
                onClick={trace}
                disabled={!ready || phase.stage === 'tracing'}
              >
                {phase.stage === 'tracing' ? 'Tracing…' : 'Trace it'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
