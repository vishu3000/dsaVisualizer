'use client'

import { useEffect, useRef, useState } from 'react'

import {
  canWriteToDisk,
  downloadFiles,
  saveToDisk,
  validateSlug,
  type FixtureFiles,
} from '@/lib/fixtureFiles.ts'
import { PROGRESS_LABELS } from '@/lib/pyodide/messages.ts'
import { RunFailure, runSource } from '@/lib/runner.ts'
import type { Trace } from '@/lib/trace/types.ts'

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
  | { stage: 'failed'; message: string; detail?: string }

export function NewFixtureModal({ initialSource, taken, onClose, onSaved }: ModalProps) {
  const [slug, setSlug] = useState('')
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

  const slugError = slug === '' ? null : validateSlug(slug, taken)
  const canTrace = slug !== '' && !slugError && source.trim() !== '' && phase.stage !== 'tracing'

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

  async function save(mode: 'disk' | 'download') {
    if (phase.stage !== 'traced') return
    const files: FixtureFiles = { slug, trace: phase.trace, source }

    if (mode === 'disk') {
      const outcome = await saveToDisk(files)
      if (outcome === 'cancelled') {
        setNote('Save cancelled.')
        return
      }
      onSaved(slug)
      return
    }

    downloadFiles(files)
    onSaved(slug)
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
          <label className="field">
            <span className="field-label">Name</span>
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
                <>
                  saves as <code>fixtures/{slug || '<name>'}.json</code> and{' '}
                  <code>examples/{slug || '<name>'}.py</code>
                </>
              )}
            </span>
          </label>

          <label className="field field-grow">
            <span className="field-label">Python source</span>
            <textarea
              className="field-code"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              spellCheck={false}
              rows={14}
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
              {Object.keys(phase.trace.meta.viz).length > 0 && (
                <span className="modal-hints">
                  @viz{' '}
                  {Object.entries(phase.trace.meta.viz)
                    .map(([name, kind]) => `${name} ${kind}`)
                    .join(' · ')}
                </span>
              )}
            </div>
          )}

          {note && <div className="modal-note">{note}</div>}
        </div>

        <div className="modal-foot">
          <span className="modal-foot-note">
            {canWriteToDisk()
              ? 'Save to repo writes both files into a folder you pick — choose the repo root.'
              : 'This browser cannot write to a folder, so the files download instead.'}
          </span>

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>

            {phase.stage === 'traced' ? (
              <>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => save('download')}
                >
                  Download
                </button>
                {canWriteToDisk() && (
                  <button type="button" className="run-button" onClick={() => save('disk')}>
                    Save to repo
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                className="run-button"
                onClick={trace}
                disabled={!canTrace}
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
