'use client'

import { BinaryTreeSvg, type BinaryNode } from '@/components/render/BinaryTreeSvg.tsx'
import type { TreeModel, TreeNodeModel } from '@/lib/shapes.ts'

function toBinary(node: TreeNodeModel): BinaryNode {
  return {
    id: node.ref,
    label: node.label,
    left: node.left ? toBinary(node.left) : null,
    right: node.right ? toBinary(node.right) : null,
  }
}

type TreeProps = {
  model: TreeModel
  /** Heap refs currently held by a local, so the walked node reads as active. */
  active: Set<string>
}

export function TreeRender({ model, active }: TreeProps) {
  return (
    <div className="shape-frame">
      <BinaryTreeSvg root={toBinary(model.root)} active={active} />
      <div className="shape-meta">
        {model.size} node{model.size === 1 ? '' : 's'}
      </div>
    </div>
  )
}
