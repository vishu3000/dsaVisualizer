'use client'

import { motion } from 'framer-motion'

import { cellText, toneOf } from '@/lib/format.ts'
import { valKey } from '@/lib/infer.ts'
import type { HeapObj } from '@/lib/trace/types.ts'

export const MAX_MEMBERS = 128

type SetProps = {
  heapId: string
  obj: Extract<HeapObj, { kind: 'set' }>
  heap: Record<string, HeapObj>
  mutated: Set<string>
}

export function SetRender({ heapId, obj, heap, mutated }: SetProps) {
  const items = obj.items

  if (items.length === 0) {
    return <div className="list-empty">empty set</div>
  }

  const shown = items.slice(0, MAX_MEMBERS)

  return (
    <div className="buckets buckets-wrap">
      {shown.map((item) => {
        const id = valKey(item)
        return (
          <motion.div
            layout
            key={`${heapId}:${id}`}
            transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            className={mutated.has(id) ? 'bucket bucket-solo bucket-mutated' : 'bucket bucket-solo'}
          >
            <span className={`bucket-value tone-${toneOf(item)}`}>{cellText(item, heap)}</span>
          </motion.div>
        )
      })}

      {items.length > MAX_MEMBERS && (
        <div className="bucket-more">+{items.length - MAX_MEMBERS} more</div>
      )}
    </div>
  )
}
