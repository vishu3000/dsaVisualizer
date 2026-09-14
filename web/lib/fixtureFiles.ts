// Saving a new fixture without a backend.
//
// The File System Access API lets the browser write into a folder the user
// picks, so Save puts the files exactly where the tracer would: the trace in
// fixtures/, the source in examples/, and the catalogue entry in
// web/lib/catalog.json beside the other categories. Copies also go into
// web/public/ so the new fixture is playable straight away, before the sync
// script next runs.

import { withProblem, type Problem, type ProblemGroup } from './problems.ts'
import { ensureWritable, recallRoot, rememberRoot, type RepoHandle } from './repoHandle.ts'
import type { Trace } from './trace/types.ts'

export const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,48}$/

export type FixtureDraft = {
  slug: string
  title: string
  blurb: string
  category: string
  source: string
  trace: Trace
}

export function validateSlug(slug: string, taken: string[]): string | null {
  if (slug === '') return 'Give the fixture a name.'
  if (!SLUG_PATTERN.test(slug)) {
    return 'Use lowercase letters, digits and underscores, starting with a letter.'
  }
  if (taken.includes(slug)) return `"${slug}" already exists.`
  return null
}

export function traceJson(trace: Trace): string {
  // Matches what `python -m tracer` writes: compact, no trailing newline.
  return JSON.stringify(trace)
}

const CATALOG_HEADER = `// GENERATED DATA — edited by the app's New-fixture modal.
// Plain data on purpose: saving a fixture rewrites this whole array.

import type { ProblemGroup } from './problems.ts'

export const CATALOG: ProblemGroup[] = `

/** The catalogue is a data-only module, so writing it is serialising an array. */
export function catalogSource(groups: ProblemGroup[]): string {
  return `${CATALOG_HEADER}${JSON.stringify(groups, null, 2)}\n`
}

export function canWriteToDisk(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

async function writeFile(root: RepoHandle, path: string[], body: string) {
  let dir = root
  for (const segment of path.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(segment, { create: true })
  }
  const handle = await dir.getFileHandle(path[path.length - 1], { create: true })
  const writable = await handle.createWritable()
  await writable.write(body)
  await writable.close()
}

export type SaveOutcome =
  | { status: 'saved'; files: string[] }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string }

/**
 * Write the fixture and register it in the catalogue.
 *
 * The user picks the repo root once and it is remembered. Everything below is
 * relative to it, so a wrong folder produces files in the wrong place rather
 * than silent failure — the returned file list says exactly what was written.
 */
/** The remembered folder when it is still writable, otherwise ask for one. */
async function resolveRoot(): Promise<RepoHandle | null> {
  const remembered = await recallRoot()
  if (remembered && (await ensureWritable(remembered))) return remembered

  const picker = (window as unknown as {
    showDirectoryPicker(options?: { mode?: string }): Promise<RepoHandle>
  }).showDirectoryPicker

  try {
    const picked = await picker({ mode: 'readwrite' })
    await rememberRoot(picked)
    return picked
  } catch {
    // The user dismissed the picker, or permission was refused.
    return null
  }
}

export async function saveFixture(
  draft: FixtureDraft,
  groups: ProblemGroup[],
): Promise<SaveOutcome> {
  const root = await resolveRoot()
  if (!root) return { status: 'cancelled' }

  const problem: Problem = { slug: draft.slug, title: draft.title, blurb: draft.blurb }
  const catalog = catalogSource(withProblem(groups, draft.category, problem))
  const trace = traceJson(draft.trace)

  const writes: [string[], string][] = [
    [['fixtures', `${draft.slug}.json`], trace],
    [['examples', `${draft.slug}.py`], draft.source],
    [['web', 'lib', 'catalog.ts'], catalog],
    // Served copies: public/ is generated, but writing it here means the new
    // fixture plays immediately instead of after the next sync.
    [['web', 'public', 'fixtures', `${draft.slug}.json`], trace],
    [['web', 'public', 'examples', `${draft.slug}.py`], draft.source],
  ]

  try {
    for (const [path, body] of writes) await writeFile(root, path, body)
  } catch (cause) {
    return {
      status: 'failed',
      message:
        cause instanceof Error
          ? `${cause.message} — is that the repository root?`
          : String(cause),
    }
  }

  return { status: 'saved', files: writes.map(([path]) => path.join('/')) }
}
