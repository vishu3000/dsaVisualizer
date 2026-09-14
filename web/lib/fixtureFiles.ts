// Saving a new fixture without a backend.
//
// A fixture is two files: the trace at fixtures/<slug>.json and the source at
// examples/<slug>.py. Where supported, the File System Access API writes both
// straight into a folder the user picks — no server, no upload. Everywhere else
// falls back to ordinary downloads.

import type { Trace } from './trace/types.ts'

export const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,48}$/

export type FixtureFiles = {
  slug: string
  trace: Trace
  source: string
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

type DirectoryHandle = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  }>
}

export function canWriteToDisk(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

async function writeInto(dir: DirectoryHandle, folder: string, name: string, body: string) {
  const sub = await dir.getDirectoryHandle(folder, { create: true })
  const file = await sub.getFileHandle(name, { create: true })
  const writable = await file.createWritable()
  await writable.write(body)
  await writable.close()
}

/**
 * Write both files into a folder the user chooses — point it at the repo root
 * and they land in fixtures/ and examples/ exactly where the tracer puts them.
 */
export async function saveToDisk(files: FixtureFiles): Promise<'saved' | 'cancelled'> {
  const picker = (window as unknown as {
    showDirectoryPicker(options?: { mode?: string }): Promise<DirectoryHandle>
  }).showDirectoryPicker

  let root: DirectoryHandle
  try {
    root = await picker({ mode: 'readwrite' })
  } catch {
    // The user dismissed the picker, or permission was refused.
    return 'cancelled'
  }

  await writeInto(root, 'fixtures', `${files.slug}.json`, traceJson(files.trace))
  await writeInto(root, 'examples', `${files.slug}.py`, files.source)
  return 'saved'
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function downloadFiles(files: FixtureFiles): void {
  download(`${files.slug}.json`, traceJson(files.trace), 'application/json')
  download(`${files.slug}.py`, files.source, 'text/x-python')
}
