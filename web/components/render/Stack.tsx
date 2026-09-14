'use client'

import { motion } from 'framer-motion'

import { formatVal, toneOf } from '@/lib/format.ts'
import type { HeapObj, Val } from '@/lib/trace/types.ts'

export const MAX_ROWS = 64

type StackProps = {
  heapId: string
  obj: Extract<HeapObj, { items: Val[] }>
  heap: Record<string, HeapObj>
  mutated: Set<number>
}

/** Grows upward: the top of the stack is the end of the list, drawn first. */
export function StackRender({ heapId, obj, heap, mutated }: StackProps) {
  const items = obj.items

  if (items.length === 0) {
    return (
      <div className="stack-frame">
        <div className="stack-empty">empty — nothing pushed</div>
        <div className="stack-base">base</div>
      </div>
    )
  }

  const shown = items.length > MAX_ROWS ? items.slice(-MAX_ROWS) : items
  const offset = items.length - shown.length

  return (
    <div className="stack-frame">
      {items.length > MAX_ROWS && (
        <div className="stack-more">+{offset} deeper</div>
      )}

      {shown
        .map((val, index) => ({ val, index: index + offset }))
        .reverse()
        .map(({ val, index }, position) => (
          <motion.div
            layout
            key={`${heapId}:${index}`}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            className={`stack-row${mutated.has(index) ? ' stack-row-mutated' : ''}${
              position === 0 ? ' stack-row-top' : ''
            }`}
          >
            <span className="stack-index">{index}</span>
            <span className={`stack-value tone-${toneOf(val)}`}>{formatVal(val, heap)}</span>
            {position === 0 && <span className="stack-tag">top</span>}
          </motion.div>
        ))}

      <div className="stack-base">base</div>
    </div>
  )
}
