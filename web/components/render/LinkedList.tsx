'use client'

import type { LinkedModel } from '@/lib/shapes.ts'

const NODE_W = 54
const NODE_H = 34
const GAP = 34
const PAD = 12

type LinkedProps = {
  model: LinkedModel
  /** Heap refs held by a local (head, cur, prev, nxt), drawn in the accent. */
  active: Set<string>
  /** Local names pointing at each ref, shown as captions. */
  labels: Map<string, string[]>
}

export function LinkedListRender({ model, active, labels }: LinkedProps) {
  const { nodes, cyclic } = model
  const width = PAD * 2 + nodes.length * NODE_W + (nodes.length - 1) * GAP
  const height = PAD * 2 + NODE_H + 26

  const xOf = (index: number) => PAD + index * (NODE_W + GAP)

  return (
    <div className="shape-frame">
      <svg
        className="shape-svg"
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: width, width: '100%' }}
        role="img"
      >
        <defs>
          <marker
            id="ll-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 z" className="shape-arrowhead" />
          </marker>
        </defs>

        {nodes.map((node, index) => {
          if (index === nodes.length - 1) return null
          const from = xOf(index) + NODE_W
          const to = xOf(index + 1)
          return (
            <line
              key={`${node.ref}-edge`}
              x1={from}
              y1={PAD + NODE_H / 2}
              x2={to - 3}
              y2={PAD + NODE_H / 2}
              className="shape-edge"
              markerEnd="url(#ll-arrow)"
            />
          )
        })}

        {nodes.map((node, index) => {
          const names = labels.get(node.ref) ?? []
          return (
            <g key={node.ref} transform={`translate(${xOf(index)}, ${PAD})`}>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={6}
                className={`shape-node ${
                  active.has(node.ref) ? 'shape-node-active' : 'shape-node-default'
                }`}
              />
              <text
                className="shape-label"
                x={NODE_W / 2}
                y={NODE_H / 2}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {node.label}
              </text>
              {names.length > 0 && (
                <text className="shape-caption" x={NODE_W / 2} y={NODE_H + 14} textAnchor="middle">
                  {names.join(' ')}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <div className="shape-meta">
        {nodes.length} node{nodes.length === 1 ? '' : 's'}
        {cyclic && ' · cycle detected'}
        {' · tail → None'}
      </div>
    </div>
  )
}
