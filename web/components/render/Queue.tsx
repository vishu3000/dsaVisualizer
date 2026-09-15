'use client'

import { motion } from 'framer-motion'

import { cellText, toneOf } from '@/lib/format.ts'
import type { HeapObj, Val } from '@/lib/trace/types.ts'

export const MAX_CELLS = 64

type QueueProps = {
  heapId: string
  obj: Extract<HeapObj, { items: Val[] }>
  heap: Record<string, HeapObj>
  mutated: Set<number>
}

/** Flows left to right: served from the head, appended at the tail. */
export function QueueRender({ heapId, obj, heap, mutated }: QueueProps) {
  const items = obj.items

  if (items.length === 0) {
    return (
      <div className="queue-frame">
        <span className="queue-cap">head</span>
        <div className="queue-empty">empty</div>
        <span className="queue-cap">tail</span>
      </div>
    )
  }

  const shown = items.slice(0, MAX_CELLS)

  return (
    <div className="queue-frame">
      <span className="queue-cap queue-cap-head">
        head
        <span className="queue-cap-note">out</span>
      </span>

      <div className="queue-track">
        {shown.map((val, index) => (
          <motion.div
            layout
            key={`${heapId}:${index}`}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            className={`queue-cell${mutated.has(index) ? ' queue-cell-mutated' : ''}${
              index === 0 ? ' queue-cell-head' : ''
            }`}
          >
            <span className={`queue-value tone-${toneOf(val)}`}>{cellText(val, heap)}</span>
            <span className="queue-index">{index}</span>
          </motion.div>
        ))}
        {items.length > MAX_CELLS && (
          <div className="queue-more">+{items.length - MAX_CELLS}</div>
        )}
      </div>

      <span className="queue-cap queue-cap-tail">
        tail
        <span className="queue-cap-note">in</span>
      </span>
    </div>
  )
}
