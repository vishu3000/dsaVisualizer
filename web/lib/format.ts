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
