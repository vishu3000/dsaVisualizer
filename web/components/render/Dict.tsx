'use client'

import { motion } from 'framer-motion'

import { formatVal, toneOf } from '@/lib/format.ts'
import { valKey } from '@/lib/infer.ts'
import type { HeapObj, Val } from '@/lib/trace/types.ts'

/** Past this, stacked rows stop being readable. */
export const MAX_ROWS = 64

type DictProps = {
  heapId: string
  obj: Extract<HeapObj, { kind: 'dict' }>
  heap: Record<string, HeapObj>
  mutated: Set<string>
}

export function DictRender({ heapId, obj, heap, mutated }: DictProps) {
  const entries = obj.entries

  if (entries.length === 0) {
    return <div className="list-empty">empty dict</div>
  }

  const shown = entries.slice(0, MAX_ROWS)

  return (
    <div className="buckets">
      {shown.map(([key, value]: [Val, Val]) => {
        const id = valKey(key)
        return (
          <motion.div
            layout
            key={`${heapId}:${id}`}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            className={mutated.has(id) ? 'bucket bucket-mutated' : 'bucket'}
          >
            <span className={`bucket-key tone-${toneOf(key)}`}>{formatVal(key, heap)}</span>
            <span className="bucket-arrow">→</span>
            <span className={`bucket-value tone-${toneOf(value)}`}>{formatVal(value, heap)}</span>
          </motion.div>
        )
      })}

      {entries.length > MAX_ROWS && (
        <div className="bucket-more">+{entries.length - MAX_ROWS} more entries</div>
      )}
    </div>
  )
}
