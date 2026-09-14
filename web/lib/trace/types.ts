// Trace schema. SPEC.md names this file as the source of truth; the types
// below are the ones written there, verbatim.

export type Ref = { ref: string }
export type Prim = { v: number | string | boolean | null }
export type Val = Ref | Prim

export type HeapObj =
  | { kind: 'list'; items: Val[] }
  | { kind: 'tuple'; items: Val[] }
  | { kind: 'set'; items: Val[] }
  | { kind: 'deque'; items: Val[] }
  | { kind: 'dict'; entries: [Val, Val][] }
  | { kind: 'obj'; cls: string; fields: Record<string, Val> }
  | { kind: 'elided'; reason: 'depth' | 'size' }

export type Frame = {
  fn: string
  line: number
  locals: Record<string, Val>
}

export type Snapshot = {
  line: number
  event: 'line' | 'call' | 'return' | 'exception'
  stack: Frame[] // innermost LAST
  heap: Record<string, HeapObj>
  stdout: string
}

export type Trace = {
  meta: {
    steps: number
    truncated: boolean
    error?: PyError
    // Not in SPEC.md's type block, but the tracer requirements mandate it:
    // `# @viz <kind> <varname>` comments come back as a render override map.
    viz: Record<string, string>
  }
  init: Snapshot
  keyframes: Record<number, Snapshot> // every 500 steps
  deltas: Delta[] // JSON-Patch ops, deltas[i] : i -> i+1
}

export type PyError = { type: string; message: string; line: number; traceback: string }

// `Delta` is referenced by SPEC.md's Trace type but left undefined there.
// It is one RFC 6902 patch: the ops taking snapshot i to snapshot i+1.
export type PatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }

export type Delta = PatchOp[]
