// Sharing goes in the URL hash and nothing else. A seeded problem travels as
// its slug; edited code travels as lz-compressed source and is re-executed on
// arrival. Traces are never put in the URL — they are rebuilt by running the
// code, which is the whole point of the tracer being deterministic.

// lz-string is CommonJS: a named import resolves under webpack but not under
// Node's ESM loader, which the test runner uses. The default import works in both.
import lzString from 'lz-string'

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = lzString

export type ShareTarget =
  | { kind: 'problem'; slug: string }
  | { kind: 'source'; source: string }
  | null

/** Long enough for any teaching example, short of what breaks address bars. */
export const MAX_HASH_LENGTH = 8000

const SLUG_PATTERN = /^[a-z0-9_]{1,64}$/

export function encodeSource(source: string): string {
  return `#c=${compressToEncodedURIComponent(source)}`
}

export function encodeProblem(slug: string): string {
  return `#p=${slug}`
}

export function parseHash(hash: string): ShareTarget {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (raw === '') return null

  const params = new URLSearchParams(raw)

  const slug = params.get('p')
  if (slug) return SLUG_PATTERN.test(slug) ? { kind: 'problem', slug } : null

  const packed = params.get('c')
  if (packed) {
    let source: string | null = null
    try {
      source = decompressFromEncodedURIComponent(packed)
    } catch {
      return null
    }
    // lz-string answers null or '' for input it cannot make sense of.
    if (!source) return null
    return { kind: 'source', source }
  }

  return null
}

/**
 * Replace rather than push: typing in the editor should not fill the back
 * button with every keystroke.
 */
export function writeHash(hash: string): void {
  if (typeof window === 'undefined') return
  if (hash.length > MAX_HASH_LENGTH) return
  if (window.location.hash === hash) return
  window.history.replaceState(null, '', hash === '' ? window.location.pathname : hash)
}
