// Pointer inference (SPEC.md): integers in the innermost frame that land inside
// a visualised list are drawn as labelled arrows beneath the cell they index,
// and recognised pairs shade the span between them.

import type { Frame, HeapObj, Snapshot, Val } from './trace/types.ts'

export type CellState = 'default' | 'active' | 'in-window' | 'just-mutated' | 'dim'

export type PointerHit = {
  name: string
  index: number
  /** True when this pointer is one end of a shaded span. */
  paired: boolean
}

export type SpanHit = {
  names: [string, string]
  from: number
  to: number
}

export type ListInference = {
  pointers: PointerHit[]
  spans: SpanHit[]
  inWindow: Set<number>
  active: Set<number>
}

/** Name pairs that read as a range. SPEC.md names these four. */
export const POINTER_PAIRS: readonly (readonly [string, string])[] = [
  ['lo', 'hi'],
  ['left', 'right'],
  ['start', 'end'],
  ['i', 'j'],
]

export const EMPTY_INFERENCE: ListInference = {
  pointers: [],
  spans: [],
  inWindow: new Set(),
  active: new Set(),
}

export function isRef(val: Val): val is { ref: string } {
  return 'ref' in val
}

export function innermostFrame(snapshot: Snapshot | null): Frame | null {
  if (!snapshot || snapshot.stack.length === 0) return null
  return snapshot.stack[snapshot.stack.length - 1]
}

/** Integer locals only: Python bools arrive as JSON booleans and are excluded. */
export function intLocals(frame: Frame): Map<string, number> {
  const out = new Map<string, number>()
  for (const [name, val] of Object.entries(frame.locals)) {
    if (isRef(val)) continue
    if (typeof val.v === 'number' && Number.isInteger(val.v)) out.set(name, val.v)
  }
  return out
}

/**
 * @param indexNames Names the source actually subscripts, from meta.indexNames.
 *   Being an int that lands inside the list is not enough to be a cursor —
 *   `max_profit = 4` over six prices looks identical to one. Pass null for a
 *   trace recorded before the tracer reported this, where every in-range int
 *   is the best guess available.
 */
export function inferForList(
  frame: Frame | null,
  length: number,
  indexNames: string[] | null,
): ListInference {
  if (!frame || length === 0) return EMPTY_INFERENCE

  const ints = intLocals(frame)
  const indexes = (value: number) => value >= 0 && value < length
  const subscripts = indexNames === null ? null : new Set(indexNames)

  const spans: SpanHit[] = []
  const paired = new Set<string>()
  for (const [a, b] of POINTER_PAIRS) {
    const av = ints.get(a)
    const bv = ints.get(b)
    if (av === undefined || bv === undefined) continue
    if (!indexes(av) || !indexes(bv)) continue

    spans.push({ names: [a, b], from: Math.min(av, bv), to: Math.max(av, bv) })
    paired.add(a)
    paired.add(b)
  }

  // A recognised pair earns its arrows through the span alone: SPEC.md names
  // lo/hi and friends outright, and binary search never subscripts either one.
  const isCursor = (name: string) =>
    paired.has(name) || subscripts === null || subscripts.has(name)

  const pointers: PointerHit[] = []
  for (const [name, value] of ints) {
    if (indexes(value) && isCursor(name)) {
      pointers.push({ name, index: value, paired: paired.has(name) })
    }
  }
  pointers.sort((a, b) => a.index - b.index || a.name.localeCompare(b.name))

  const inWindow = new Set<number>()
  for (const span of spans) {
    for (let i = span.from; i <= span.to; i++) inWindow.add(i)
  }

  // A lone pointer (mid, i, cur) marks the cell being looked at right now;
  // span ends are already carried by the shading.
  const active = new Set<number>()
  for (const pointer of pointers) {
    if (!pointer.paired) active.add(pointer.index)
  }

  return { pointers, spans, inWindow, active }
}

/**
 * Identity for a Val, so dict keys and set members can be matched across steps
 * by what they are rather than where they sit. Python reorders set iteration
 * freely, and dict keys survive reinsertion, so position is not identity.
 */
export function valKey(val: Val): string {
  return isRef(val) ? `#${val.ref}` : `=${JSON.stringify(val.v)}`
}

function sameVal(a: Val | undefined, b: Val | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  if (isRef(a) || isRef(b)) return isRef(a) && isRef(b) && a.ref === b.ref
  return a.v === b.v
}

/**
 * Indices whose value differs from the previous step. Needs the previous
 * snapshot, which is why "just mutated" cannot be derived from one snapshot.
 */
export function mutatedIndices(current: HeapObj, previous: HeapObj | undefined): Set<number> {
  const out = new Set<number>()
  if (!current || !('items' in current)) return out
  if (!previous || !('items' in previous)) return out

  for (let i = 0; i < current.items.length; i++) {
    if (!sameVal(current.items[i], previous.items[i])) out.add(i)
  }
  return out
}

/** Dict keys whose value changed, plus keys that were not there before. */
export function mutatedEntries(current: HeapObj, previous: HeapObj | undefined): Set<string> {
  const out = new Set<string>()
  if (!current || current.kind !== 'dict') return out
  if (!previous || previous.kind !== 'dict') return out

  const before = new Map<string, Val>()
  for (const [key, value] of previous.entries) before.set(valKey(key), value)

  for (const [key, value] of current.entries) {
    const id = valKey(key)
    if (!before.has(id) || !sameVal(before.get(id), value)) out.add(id)
  }
  return out
}

/** Set members that were not present in the previous step. */
export function mutatedMembers(current: HeapObj, previous: HeapObj | undefined): Set<string> {
  const out = new Set<string>()
  if (!current || !('items' in current)) return out
  if (!previous || !('items' in previous)) return out

  const before = new Set(previous.items.map(valKey))
  for (const item of current.items) {
    const id = valKey(item)
    if (!before.has(id)) out.add(id)
  }
  return out
}

export function cellState(
  index: number,
  inference: ListInference,
  mutated: Set<number>,
): CellState {
  if (mutated.has(index)) return 'just-mutated'
  if (inference.active.has(index)) return 'active'
  if (inference.inWindow.has(index)) return 'in-window'
  // Out of range only means something when a range is actually on screen.
  if (inference.spans.length > 0) return 'dim'
  return 'default'
}

/** Local names bound to a heap object, innermost frame first. */
export function namesForRef(snapshot: Snapshot | null, ref: string): string[] {
  if (!snapshot) return []
  const names: string[] = []
  for (let i = snapshot.stack.length - 1; i >= 0; i--) {
    for (const [name, val] of Object.entries(snapshot.stack[i].locals)) {
      if (isRef(val) && val.ref === ref && !names.includes(name)) names.push(name)
    }
  }
  return names
}
