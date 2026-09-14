// Rebuild any snapshot from a delta-encoded trace.
//
// reconstruct(trace, i) walks back to the nearest keyframe at or before i and
// replays deltas forward, so it never applies more than one keyframe interval
// of patches no matter how the user scrubs.

import type { Delta, Snapshot, Trace } from './types.ts'

function unescapeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~')
}

function parsePointer(path: string): string[] {
  if (path === '') return []
  return path.split('/').slice(1).map(unescapeToken)
}

function applyPatch(doc: Snapshot, ops: Delta): void {
  for (const op of ops) {
    const tokens = parsePointer(op.path)
    if (tokens.length === 0) {
      throw new Error(`cannot patch the document root: ${op.path}`)
    }

    let parent: any = doc
    for (let k = 0; k < tokens.length - 1; k++) {
      parent = Array.isArray(parent) ? parent[Number(tokens[k])] : parent[tokens[k]]
      if (parent === undefined || parent === null) {
        throw new Error(`path does not resolve: ${op.path}`)
      }
    }

    const last = tokens[tokens.length - 1]

    if (op.op === 'remove') {
      if (Array.isArray(parent)) parent.splice(Number(last), 1)
      else delete parent[last]
      continue
    }

    // Clone: the op belongs to the trace, the snapshot must not alias it.
    const value = structuredClone(op.value)

    if (op.op === 'add') {
      if (!Array.isArray(parent)) parent[last] = value
      else if (last === '-') parent.push(value)
      else parent.splice(Number(last), 0, value)
    } else if (op.op === 'replace') {
      if (Array.isArray(parent)) parent[Number(last)] = value
      else parent[last] = value
    } else {
      throw new Error(`unsupported op: ${JSON.stringify(op)}`)
    }
  }
}

export function reconstruct(trace: Trace, i: number): Snapshot {
  const total = trace.meta.steps
  if (!Number.isInteger(i) || i < 0 || i >= total) {
    throw new RangeError(`step ${i} out of range (0..${total - 1})`)
  }

  let baseIndex = 0
  let base = trace.init
  for (const key of Object.keys(trace.keyframes)) {
    const k = Number(key)
    if (k > baseIndex && k <= i) {
      baseIndex = k
      base = trace.keyframes[k]
    }
  }

  const snapshot = structuredClone(base)
  for (let j = baseIndex; j < i; j++) {
    applyPatch(snapshot, trace.deltas[j])
  }
  return snapshot
}
