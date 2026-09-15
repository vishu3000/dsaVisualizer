'use client'

import { ListRender } from '@/components/render/List.tsx'
import { cellText, toneOf } from '@/lib/format.ts'
import { EMPTY_INFERENCE, mutatedIndices } from '@/lib/infer.ts'
import type { HeapObj, Val } from '@/lib/trace/types.ts'

type ObjProps = {
  obj: Extract<HeapObj, { kind: 'obj' }>
  heap: Record<string, HeapObj>
  /** The step before, so a field that just changed can say so. */
  previousHeap: Record<string, HeapObj>
}

/** The heap object a field points at, when it points at one. */
function targetOf(val: Val, heap: Record<string, HeapObj>): HeapObj | undefined {
  return 'ref' in val ? heap[val.ref] : undefined
}

/**
 * A plain instance: its fields, with any sequence among them drawn as cells.
 *
 * Classes that are not trees or linked lists used to draw nothing at all — a
 * hand-written Queue produced an empty canvas, because the registry only knew
 * how to recognise `.left`/`.right` and `.next`. The interesting part of such
 * a class is almost always one collection surrounded by bookkeeping, so the
 * collection gets cells and the bookkeeping gets a row each.
 */
export function ObjRender({ obj, heap, previousHeap }: ObjProps) {
  const fields = Object.entries(obj.fields)

  if (fields.length === 0) {
    return <div className="list-empty">{obj.cls} has no fields</div>
  }

  return (
    <div className="obj-card">
      {fields.map(([name, val]) => {
        const target = targetOf(val, heap)
        const drawable = target && 'items' in target && target.items.length > 0

        return (
          <div className={drawable ? 'obj-field obj-field-wide' : 'obj-field'} key={name}>
            <span className="obj-field-name">{name}</span>

            {drawable ? (
              <ListRender
                heapId={(val as { ref: string }).ref}
                obj={target}
                heap={heap}
                // No pointer inference inside a field: the index names are
                // recorded against the container, not against `self.items`.
                inference={EMPTY_INFERENCE}
                mutated={mutatedIndices(target, previousHeap[(val as { ref: string }).ref])}
              />
            ) : (
              <span className={`obj-field-value tone-${toneOf(val)}`}>
                {cellText(val, heap)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
