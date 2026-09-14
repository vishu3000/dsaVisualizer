'use client'

import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js'
import { useEffect, useMemo, useState } from 'react'

import type { GraphModel } from '@/lib/shapes.ts'

const NODE_W = 44
const NODE_H = 34
const PAD = 14

type Placed = {
  width: number
  height: number
  nodes: { id: string; x: number; y: number }[]
  edges: { id: string; points: { x: number; y: number }[] }[]
}

type GraphProps = {
  model: GraphModel
  visited: Set<string>
  pointers: Map<string, string[]>
}

export function GraphRender({ model, visited, pointers }: GraphProps) {
  // Re-layout only when the shape changes. Visiting a node must not make the
  // whole drawing jump, and elk is far too slow to run on every step.
  const signature = useMemo(
    () =>
      `${model.nodes.map((node) => node.id).join(',')}|${model.edges
        .map((edge) => `${edge.from}>${edge.to}`)
        .join(',')}`,
    [model],
  )

  const [placed, setPlaced] = useState<Placed | null>(null)

  useEffect(() => {
    let cancelled = false
    const elk = new ELK()

    const graph: ElkNode = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '26',
        'elk.layered.spacing.nodeNodeBetweenLayers': '52',
        'elk.edgeRouting': 'POLYLINE',
      },
      children: model.nodes.map((node) => ({ id: node.id, width: NODE_W, height: NODE_H })),
      edges: model.edges.map((edge) => ({
        id: edge.id,
        sources: [edge.from],
        targets: [edge.to],
      })),
    }

    elk
      .layout(graph)
      .then((result) => {
        if (cancelled) return
        setPlaced({
          width: (result.width ?? 0) + PAD * 2,
          height: (result.height ?? 0) + PAD * 2,
          nodes: (result.children ?? []).map((child) => ({
            id: child.id,
            x: (child.x ?? 0) + PAD,
            y: (child.y ?? 0) + PAD,
          })),
          edges: (result.edges ?? []).map((edge) => {
            const section = edge.sections?.[0]
            const points = section
              ? [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
              : []
            return {
              id: edge.id,
              points: points.map((point) => ({ x: point.x + PAD, y: point.y + PAD })),
            }
          }),
        })
      })
      .catch(() => {
        if (!cancelled) setPlaced(null)
      })

    return () => {
      cancelled = true
    }
  }, [signature, model])

  const labels = useMemo(
    () => new Map(model.nodes.map((node) => [node.id, node.label])),
    [model],
  )

  const edgeEnds = useMemo(
    () => new Map(model.edges.map((edge) => [edge.id, edge])),
    [model],
  )

  if (!placed) {
    return <div className="shape-frame shape-pending">laying out graph…</div>
  }

  return (
    <div className="shape-frame">
      <svg
        className="shape-svg"
        viewBox={`0 0 ${placed.width} ${placed.height}`}
        style={{ maxWidth: placed.width, width: '100%' }}
        role="img"
      >
        <defs>
          <marker
            id="graph-arrow"
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

        {placed.edges.map((edge) => {
          if (edge.points.length < 2) return null
          // An edge counts as taken once both of its endpoints have been seen.
          const ends = edgeEnds.get(edge.id)
          const taken = !!ends && visited.has(ends.from) && visited.has(ends.to)
          return (
            <polyline
              key={edge.id}
              points={edge.points.map((point) => `${point.x},${point.y}`).join(' ')}
              className={taken ? 'shape-edge shape-edge-taken' : 'shape-edge'}
              markerEnd="url(#graph-arrow)"
              fill="none"
            />
          )
        })}

        {placed.nodes.map((node) => {
          const names = pointers.get(node.id) ?? []
          const state = names.length
            ? 'shape-node-active'
            : visited.has(node.id)
              ? 'shape-node-visited'
              : 'shape-node-default'

          return (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              <rect width={NODE_W} height={NODE_H} rx={17} className={`shape-node ${state}`} />
              <text
                className="shape-label"
                x={NODE_W / 2}
                y={NODE_H / 2}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {labels.get(node.id)}
              </text>
              {names.length > 0 && (
                <text className="shape-caption" x={NODE_W / 2} y={NODE_H + 13} textAnchor="middle">
                  {names.join(' ')}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      <div className="shape-meta">
        {model.nodes.length} nodes · {model.edges.length} edges · {visited.size} visited
      </div>
    </div>
  )
}
