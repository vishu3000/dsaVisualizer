'use client'

import { motion } from 'framer-motion'

import { cellState, type ListInference } from '@/lib/infer.ts'
import type { HeapObj, Val } from '@/lib/trace/types.ts'

/** Above this, a grid of cells stops being readable and costs more than it shows. */
export const MAX_CELLS = 128

const CELL_MAX = 76
const GAP = 8

type ListProps = {
  heapId: string
  obj: Extract<HeapObj, { items: Val[] }>
  heap: Record<string, HeapObj>
  inference: ListInference
  mutated: Set<number>
}

function formatPrim(value: number | string | boolean | null): string {
  if (value === null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  return String(value)
}

/** Nested containers are summarised; the cell shows what it points at. */
function formatRef(ref: string, heap: Record<string, HeapObj>): string {
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
      return '…'
  }
}

function cellText(val: Val, heap: Record<string, HeapObj>): string {
  return 'ref' in val ? formatRef(val.ref, heap) : formatPrim(val.v)
}

export function ListRender({ heapId, obj, heap, inference, mutated }: ListProps) {
  const items = obj.items
  const count = items.length

  if (count === 0) {
    return <div className="list-empty">empty {obj.kind}</div>
  }

  if (count > MAX_CELLS) {
    return (
      <div className="list-empty">
        {obj.kind}[{count}] — too many cells to draw
      </div>
    )
  }

  const columns = `repeat(${count}, minmax(0, 1fr))`
  const maxWidth = count * CELL_MAX + (count - 1) * GAP
  const byIndex = new Map<number, typeof inference.pointers>()
  for (const pointer of inference.pointers) {
    const bucket = byIndex.get(pointer.index) ?? []
    bucket.push(pointer)
    byIndex.set(pointer.index, bucket)
  }

  return (
    <div className="list-render" style={{ maxWidth }}>
      {inference.spans.length > 0 && (
        <div className="list-row" style={{ gridTemplateColumns: columns }}>
          {inference.spans.map((span) => (
            <div
              key={span.names.join('-')}
              className="span-bracket"
              style={{ gridColumn: `${span.from + 1} / span ${span.to - span.from + 1}` }}
            >
              <span className="span-label">
                {span.names[0]} … {span.names[1]} · {span.to - span.from + 1}
              </span>
              <span className="span-line" />
            </div>
          ))}
        </div>
      )}

      <div className="list-row list-cells" style={{ gridTemplateColumns: columns }}>
        {items.map((val, index) => (
          <motion.div
            layout
            key={`${heapId}:${index}`}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            className={`cell cell-${cellState(index, inference, mutated)}`}
            title={cellText(val, heap)}
          >
            {cellText(val, heap)}
          </motion.div>
        ))}
      </div>

      <div className="list-row list-indexes" style={{ gridTemplateColumns: columns }}>
        {items.map((_, index) => (
          <span
            key={`${heapId}:idx:${index}`}
            className={inference.inWindow.has(index) ? 'index-mark index-lit' : 'index-mark'}
          >
            {index}
          </span>
        ))}
      </div>

      {byIndex.size > 0 && (
        <div className="list-row list-pointers" style={{ gridTemplateColumns: columns }}>
          {items.map((_, index) => {
            const hits = byIndex.get(index)
            if (!hits) return <span key={`${heapId}:ptr:${index}`} />
            return (
              <span className="pointer-stack" key={`${heapId}:ptr:${index}`}>
                <span className={hits[0].paired ? 'pointer-arrow' : 'pointer-arrow pointer-hot'}>
                  ▲
                </span>
                {hits.map((hit) => (
                  <span
                    key={hit.name}
                    className={hit.paired ? 'pointer-label' : 'pointer-label pointer-hot'}
                  >
                    {hit.name} {hit.index}
                  </span>
                ))}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
