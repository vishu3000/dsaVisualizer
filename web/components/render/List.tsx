'use client'

import { motion } from 'framer-motion'

import { cellText } from '@/lib/format.ts'
import { cellState, type ListInference } from '@/lib/infer.ts'
import type { HeapObj, Val } from '@/lib/trace/types.ts'

/** Above this, a grid of cells stops being readable and costs more than it shows. */
export const MAX_CELLS = 128

/** Narrowest a cell gets, which is also what a number needs. */
const CELL_MIN = 76
/** Widest, past which a preview is ellipsed rather than shoving the row off-screen. */
const CELL_MAX = 170
const GAP = 8

/**
 * Cells size to their contents now that they carry them.
 *
 * The font is monospace, so width follows character count; past a handful of
 * characters the text drops a size, which keeps a nested list from forcing
 * cells three times the width of the numbers beside them.
 */
const DENSE_OVER = 7
const CHAR_W = { normal: 9.2, dense: 7.6 }
const CELL_PAD = 18

/** How far a second-lane pointer label drops. One label height plus air. */
const LANE_DROP = 22

type ListProps = {
  heapId: string
  obj: Extract<HeapObj, { items: Val[] }>
  heap: Record<string, HeapObj>
  inference: ListInference
  mutated: Set<number>
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

  const texts = items.map((val) => cellText(val, heap))
  const longest = texts.reduce((widest, text) => Math.max(widest, text.length), 1)
  const dense = longest > DENSE_OVER
  const cellWidth = Math.min(
    CELL_MAX,
    Math.max(CELL_MIN, Math.ceil(longest * (dense ? CHAR_W.dense : CHAR_W.normal)) + CELL_PAD),
  )

  // A floor, not just a target: without it the grid squeezes cells below what
  // their contents need and the text is cut at both ends rather than ellipsed.
  const columns = `repeat(${count}, minmax(${cellWidth}px, 1fr))`
  const maxWidth = count * cellWidth + (count - 1) * GAP
  const byIndex = new Map<number, typeof inference.pointers>()
  for (const pointer of inference.pointers) {
    const bucket = byIndex.get(pointer.index) ?? []
    bucket.push(pointer)
    byIndex.set(pointer.index, bucket)
  }

  // A label like `current_price 3` is wider than its 76px column and spills
  // into the neighbours, so two pointers on adjacent cells print on top of
  // each other. Alternating lanes drops every other label by one row: the
  // arrows stay put, and no two labels can share a line unless their cells
  // are at least two apart.
  const lanes = new Map<number, number>()
  ;[...byIndex.keys()]
    .sort((a, b) => a - b)
    .forEach((index, order) => lanes.set(index, order % 2))

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
            className={`cell cell-${cellState(index, inference, mutated)}${
              dense ? ' cell-dense' : ''
            }`}
            title={texts[index]}
          >
            {/* The span is what ellipses: text-overflow does not apply to a
                flex container, only to a block inside one. */}
            <span className="cell-text">{texts[index]}</span>
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
                {hits.map((hit, rank) => (
                  <span
                    key={hit.name}
                    className={hit.paired ? 'pointer-label' : 'pointer-label pointer-hot'}
                    style={
                      rank === 0 && lanes.get(index) ? { marginTop: LANE_DROP } : undefined
                    }
                  >
                    {/* A value cursor has no index to show: it holds the cell,
                        and where that cell sits is the renderer's answer. */}
                    {hit.kind === 'value' ? hit.name : `${hit.name} ${hit.index}`}
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
