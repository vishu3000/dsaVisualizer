'use client'

import { useEffect, useRef, useState } from 'react'

import {
  canWriteToDisk,
  saveFixture,
  validateSlug,
  type FixtureDraft,
} from '@/lib/fixtureFiles.ts'
import { CATEGORY_LABELS, PROBLEM_GROUPS } from '@/lib/problems.ts'
import { forgetRoot, recallRoot } from '@/lib/repoHandle.ts'
import { PROGRESS_LABELS } from '@/lib/pyodide/messages.ts'
import { RunFailure, runSource } from '@/lib/runner.ts'

const NEW_CATEGORY = '__new__'

type ModalProps = {
  /** Whatever is in the editor right now — the modal never edits it. */
  source: string
  taken: string[]
  onClose: () => void
  onSaved: (slug: string) => void
}

type Phase =
  | { stage: 'editing' }
  | { stage: 'tracing'; message: string }
  | { stage: 'writing' }
  | { stage: 'failed'; message: string; detail?: string }

export function NewFixtureModal({ source, taken, onClose, onSaved }: ModalProps) {
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [blurb, setBlurb] = useState('')
  const [category, setCategory] = useState(CATEGORY_LABELS[0] ?? NEW_CATEGORY)
  const [newCategory, setNewCategory] = useState('')
  const [phase, setPhase] = useState<Phase>({ stage: 'editing' })
  const [note, setNote] = useState<string | null>(null)
  const [repo, setRepo] = useState<string | null>(null)
  const slugRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    slugRef.current?.focus()
  }, [])

  useEffect(() => {
    recallRoot().then((handle) => setRepo(handle?.name ?? null))
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const lineCount = source.trim() === '' ? 0 : source.replace(/\n$/, '').split('\n').length
  const creatingCategory = category === NEW_CATEGORY
  const resolvedCategory = creatingCategory ? newCategory.trim() : category

  const slugError = slug === '' ? null : validateSlug(slug, taken)
  const categoryError =
    creatingCategory && newCategory.trim() === '' ? 'Name the new category.' : null

  const busy = phase.stage === 'tracing' || phase.stage === 'writing'
  const ready =
    slug !== '' &&
    !slugError &&
    !categoryError &&
    title.trim() !== '' &&
    source.trim() !== '' &&
    canWriteToDisk() &&
    !busy

  /** One action: trace what the editor holds, then write the files. */
  async function save() {
    setNote(null)
    setPhase({ stage: 'tracing', message: PROGRESS_LABELS.boot })

    let trace
    try {
      trace = await runSource(source, {
        onProgress: (progress) => setPhase({ stage: 'tracing', message: progress.message }),
      })
    } catch (cause) {
      const failure = cause instanceof RunFailure ? cause : null
      setPhase({
        stage: 'failed',
        message: failure?.message ?? String(cause),
        detail: failure?.detail,
      })
      return
    }

    const draft: FixtureDraft = {
      slug,
      title: title.trim(),
      blurb: blurb.trim() || 'added from the app',
      category: resolvedCategory,
      source,
      trace,
    }

    setPhase({ stage: 'writing' })
    const outcome = await saveFixture(draft, PROBLEM_GROUPS)

    if (outcome.status === 'saved') {
      onSaved(slug)
      return
    }

    setPhase({ stage: 'editing' })
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
                {categoryError ? (
                  <span className="field-error">{categoryError}</span>
                ) : creatingCategory ? (
                  'added beside the existing ones'
                ) : (
                  'existing category'
                )}
              </span>
            </label>

            {creatingCategory ? (
              <label className="field">
                <span className="field-label">New category name</span>
                <input
                  className="field-input"
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="Sorting"
                />
                <span className="field-note">one line, sentence case</span>
              </label>
            ) : (
              <label className="field">
                <span className="field-label">Description</span>
                <input
                  className="field-input"
                  value={blurb}
                  onChange={(event) => setBlurb(event.target.value)}
                  placeholder="divide, sort halves, merge back"
                />
                <span className="field-note">one line under the title</span>
              </label>
            )}
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

          {phase.stage === 'tracing' && (
            <div className="modal-status">
              <span className="pill pill-ready">
                <span className="pill-dot pill-dot-pulse" />
                {phase.message}
              </span>
            </div>
          )}

          {phase.stage === 'writing' && (
            <div className="modal-status">
              <span className="pill pill-ready">
                <span className="pill-dot pill-dot-pulse" />
                writing files
              </span>
            </div>
          )}

          {phase.stage === 'failed' && (
            <div className="error-card">
              <div className="error-title">{phase.message}</div>
              {phase.detail && <div className="error-body">{phase.detail}</div>}
            </div>
          )}

          {note && <div className="modal-note">{note}</div>}
        </div>

        <div className="modal-foot">
          <span className="modal-foot-note">
            {!canWriteToDisk() ? (
              'This browser cannot write files. Use Chrome or Edge to save.'
            ) : (
              <>
                Traces {lineCount} line{lineCount === 1 ? '' : 's'} from the editor into{' '}
                {resolvedCategory || '…'}
                {repo ? (
                  <>
                    {' · saving to '}
                    <code>{repo}/</code>{' '}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => forgetRoot().then(() => setRepo(null))}
                    >
                      change
                    </button>
                  </>
                ) : (
                  ' · you will be asked for the repository folder once'
                )}
              </>
            )}
          </span>

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="run-button" onClick={save} disabled={!ready}>
              {phase.stage === 'tracing'
                ? 'Tracing…'
                : phase.stage === 'writing'
                  ? 'Saving…'
                  : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
