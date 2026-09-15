'use client'

import { hierarchy, tree } from 'd3-hierarchy'
import { useMemo } from 'react'

import { nodeWidth, shortLabel } from '@/lib/nodeLabel.ts'

/** Shared shape for anything laid out as a binary tree: BST nodes and heap indices. */
export type BinaryNode = {
  id: string
  label: string
  left: BinaryNode | null
  right: BinaryNode | null
  /** Stands in for a missing child so siblings keep their left/right sides. */
  placeholder?: boolean
}

/** Narrowest a node gets; wider when its labels carry contents. */
const NODE_MIN_W = 64
const NODE_H = 42
const GAP_X = 22
const GAP_Y = 78
const PAD = 22

/** How far past its laid-out width the tree may be scaled up. See Graph.tsx. */
const MAX_GROWTH = 1.7

function childrenOf(node: BinaryNode): BinaryNode[] | null {
  if (!node.left && !node.right) return null
  // Both slots are always emitted, so a lone right child still leans right.
  const fill = (side: BinaryNode | null, suffix: string): BinaryNode =>
    side ?? { id: `${node.id}:${suffix}`, label: '', left: null, right: null, placeholder: true }
  return [fill(node.left, 'l'), fill(node.right, 'r')]
}

type Props = {
  root: BinaryNode
  /** Node ids drawn in the execution accent. */
  active?: Set<string>
  /** Node ids drawn as just-mutated. */
  mutated?: Set<string>
}

export function BinaryTreeSvg({ root, active, mutated }: Props) {
  const layout = useMemo(() => {
    const laidOut = hierarchy(root, childrenOf)
    const NODE_W = nodeWidth(
      laidOut.descendants().filter((d) => !d.data.placeholder).map((d) => d.data.label),
      NODE_MIN_W,
    )

    // tree() returns point nodes with x/y resolved; the input node's are optional.
    const laid = tree<BinaryNode>().nodeSize([NODE_W + GAP_X, GAP_Y])(laidOut)

    const points = laid.descendants()
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)

    return {
      points,
      links: laid.links(),
      nodeW: NODE_W,
      offsetX: -minX + PAD + NODE_W / 2,
      width: maxX - minX + NODE_W + PAD * 2,
      height: maxY + NODE_H + PAD * 2,
    }
  }, [root])

  const shift = (x: number) => x + layout.offsetX
  const top = (y: number) => y + PAD

  return (
    <svg
      className="shape-svg"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      style={{ maxWidth: layout.width * MAX_GROWTH, width: '100%' }}
      role="img"
    >
      <g>
        {layout.links.map((link) => {
          if (link.target.data.placeholder) return null
          return (
            <line
              key={`${link.source.data.id}->${link.target.data.id}`}
              x1={shift(link.source.x)}
              y1={top(link.source.y) + NODE_H / 2}
              x2={shift(link.target.x)}
              y2={top(link.target.y) - NODE_H / 2}
              className="shape-edge"
            />
          )
        })}
      </g>

      <g>
        {layout.points.map((point) => {
          const node = point.data
          if (node.placeholder) return null

          const state = mutated?.has(node.id)
            ? 'shape-node-mutated'
            : active?.has(node.id)
              ? 'shape-node-active'
              : 'shape-node-default'

          return (
            <g key={node.id} transform={`translate(${shift(point.x)}, ${top(point.y)})`}>
              <rect
                x={-layout.nodeW / 2}
                y={-NODE_H / 2}
                width={layout.nodeW}
                height={NODE_H}
                rx={8}
                className={`shape-node ${state}`}
              />
              <text className="shape-label" textAnchor="middle" dominantBaseline="central">
                {/* SVG has no ellipsis, so the cut is ours; the title carries
                    whatever did not fit. */}
                <title>{node.label}</title>
                {shortLabel(node.label)}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
