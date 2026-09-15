// Shared value formatting: heap values rendered the way Python would show them.

import type { HeapObj, Val } from './trace/types.ts'

export type Tone = 'number' | 'string' | 'bool' | 'none' | 'ref'

export function formatPrim(value: number | string | boolean | null): string {
  if (value === null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  return String(value)
}

/** A nested container is summarised by kind and size, never inlined. */
export function formatRef(ref: string, heap: Record<string, HeapObj>): string {
  const target = heap[ref]
  if (!target) return '·'
  switch (target.kind) {
    case 'list':
    case 'tuple':
    case 'set':
    case 'deque':
      return `${target.kind}[${target.items.length}]`
    case 'dict':
      return `dict{${target.entries.length}}`
    case 'obj':
      return target.cls
    case 'elided':
      return `… (${target.reason})`
  }
}

export function formatVal(val: Val, heap: Record<string, HeapObj>): string {
  return 'ref' in val ? formatRef(val.ref, heap) : formatPrim(val.v)
}

/**
 * The Python type name for a value, for the badge beside a variable.
 *
 * A ref reports what the heap object actually is; a primitive is read back off
 * the JSON, which is why int and float are told apart by Number.isInteger
 * rather than by anything the tracer recorded.
 */
export function pyType(val: Val, heap: Record<string, HeapObj>): string {
  if ('ref' in val) {
    const target = heap[val.ref]
    if (!target) return 'ref'
    return target.kind === 'obj' ? target.cls : target.kind
  }

  const value = val.v
  if (value === null) return 'None'
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'string') return 'str'
  return Number.isInteger(value) ? 'int' : 'float'
}

export function toneOf(val: Val): Tone {
  if ('ref' in val) return 'ref'
  if (val.v === null) return 'none'
  if (typeof val.v === 'boolean') return 'bool'
  if (typeof val.v === 'number') return 'number'
  return 'string'
}

/**
 * What a single cell or chip shows.
 *
 * A cell is a box on the canvas, not a row in a table, so `list[2]` names the
 * shape and hides the thing the reader came to see. Containers show their
 * contents; a container nested inside one of those falls back to the summary,
 * which is what stops a cell from unfolding the whole heap.
 *
 * An object keeps its class name for the same reason — `Node(val=1,
 * next=Node)` does not belong in a box the width of a number.
 */
export function cellText(val: Val, heap: Record<string, HeapObj>): string {
  if (!('ref' in val)) return formatPrim(val.v)

  const target = heap[val.ref]
  if (!target) return '·'

  switch (target.kind) {
    case 'list':
    case 'tuple':
    case 'set':
    case 'deque':
    case 'dict':
      return previewHeap(target, heap)
    case 'obj':
      return target.cls
    case 'elided':
      return '…'
  }
}

/**
 * How much of a value the Variables table will print before giving up.
 *
 * "Show the whole thing" is right until a list has 500 elements and the row
 * becomes a wall. The budget is in characters rather than items so that ten
 * nested lists and a hundred small integers are each allowed what they
 * actually need.
 */
const FULL_BUDGET = 420

/** Join parts until the budget runs out, then say so. */
function joinWithin(parts: string[], open: string, close: string): string {
  const kept: string[] = []
  let used = 0

  for (const part of parts) {
    if (used + part.length > FULL_BUDGET) {
      kept.push(`… ${parts.length - kept.length} more`)
      break
    }
    kept.push(part)
    used += part.length + 2
  }
  return `${open}${kept.join(', ')}${close}`
}

/**
 * A value written out, for the Variables table.
 *
 * Goes one level further than cellText, because this is the surface for
 * reading values rather than a box on a diagram: every element is listed, and
 * a container nested inside shows its own contents instead of `list[2]`.
 */
export function fullText(val: Val, heap: Record<string, HeapObj>): string {
  if (!('ref' in val)) return formatPrim(val.v)

  const target = heap[val.ref]
  if (!target) return '·'

  switch (target.kind) {
    case 'list':
    case 'deque':
      return joinWithin(target.items.map((item) => cellText(item, heap)), '[', ']')
    case 'tuple':
      return joinWithin(target.items.map((item) => cellText(item, heap)), '(', ')')
    case 'set':
      return joinWithin(target.items.map((item) => cellText(item, heap)), '{', '}')
    case 'dict':
      return joinWithin(
        target.entries.map(
          ([key, value]) => `${cellText(key, heap)}: ${cellText(value, heap)}`,
        ),
        '{',
        '}',
      )
    case 'obj':
      return joinWithin(
        Object.entries(target.fields).map(
          ([name, value]) => `${name}=${cellText(value, heap)}`,
        ),
        `${target.cls}(`,
        ')',
      )
    case 'elided':
      return `elided (${target.reason})`
  }
}

const PREVIEW_ITEMS = 6

/** One level deep: enough to recognise a value without unfolding the heap. */
export function previewHeap(obj: HeapObj, heap: Record<string, HeapObj>): string {
  switch (obj.kind) {
    case 'list':
    case 'tuple':
    case 'set':
    case 'deque': {
      const shown = obj.items.slice(0, PREVIEW_ITEMS).map((item) => formatVal(item, heap))
      if (obj.items.length > PREVIEW_ITEMS) shown.push('…')
      const [open, close] =
        obj.kind === 'tuple' ? ['(', ')'] : obj.kind === 'set' ? ['{', '}'] : ['[', ']']
      return `${open}${shown.join(', ')}${close}`
    }
    case 'dict': {
      const shown = obj.entries
        .slice(0, PREVIEW_ITEMS)
        .map(([key, value]) => `${formatVal(key, heap)}: ${formatVal(value, heap)}`)
      if (obj.entries.length > PREVIEW_ITEMS) shown.push('…')
      return `{${shown.join(', ')}}`
    }
    case 'obj': {
      const fields = Object.entries(obj.fields)
        .slice(0, PREVIEW_ITEMS)
        .map(([name, value]) => `${name}=${formatVal(value, heap)}`)
      if (Object.keys(obj.fields).length > PREVIEW_ITEMS) fields.push('…')
      return `${obj.cls}(${fields.join(', ')})`
    }
    case 'elided':
      return `elided (${obj.reason})`
  }
}
