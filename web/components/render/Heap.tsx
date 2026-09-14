'use client'

import { BinaryTreeSvg, type BinaryNode } from '@/components/render/BinaryTreeSvg.tsx'
import type { HeapModel, HeapNodeModel } from '@/lib/shapes.ts'

function toBinary(node: HeapNodeModel): BinaryNode {
  return {
    id: String(node.index),
    label: node.label,
    left: node.left ? toBinary(node.left) : null,
    right: node.right ? toBinary(node.right) : null,
  }
}

type HeapProps = {
  model: HeapModel
  /** List indices that changed this step, as strings to match node ids. */
  mutated: Set<number>
}

export function HeapRender({ model, mutated }: HeapProps) {
  return (
    <div className="shape-frame">
      <BinaryTreeSvg
        root={toBinary(model.root)}
        mutated={new Set([...mutated].map(String))}
      />
      <div className="shape-meta">
        {model.size} element{model.size === 1 ? '' : 's'} · children at 2i+1 and 2i+2
      </div>
    </div>
  )
}
