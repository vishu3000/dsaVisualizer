'use client'

import {
  activePath,
  MAX_TREE_NODES,
  statusOf,
  type CallNode,
  type CallTree,
} from '@/lib/callTree.ts'

type TreeProps = {
  tree: CallTree
  step: number
  onSeek: (step: number) => void
}

function Row({
  node,
  step,
  onSeek,
  indent,
}: {
  node: CallNode
  step: number
  onSeek: (step: number) => void
  indent: number
}) {
  const status = statusOf(node, step)
  const args = node.args.map((arg) => `${arg.name}=${arg.value}`).join(', ')

  return (
    <button
      type="button"
      className={`tree-row tree-${status}`}
      style={{ paddingLeft: 8 + indent * 15 }}
      onClick={() => onSeek(node.callStep)}
      title={`jump to step ${node.callStep + 1}`}
    >
      <span className="tree-fn">{node.fn}</span>
      <span className="tree-args">({args})</span>
      <span className="tree-steps">
        {node.callStep + 1}
        {node.returnStep !== null ? `→${node.returnStep + 1}` : '→…'}
      </span>
    </button>
  )
}

function Branch({
  node,
  step,
  onSeek,
}: {
  node: CallNode
  step: number
  onSeek: (step: number) => void
}) {
  return (
    <>
      <Row node={node} step={step} onSeek={onSeek} indent={node.depth} />
      {node.children.map((child) => (
        <Branch key={child.id} node={child} step={step} onSeek={onSeek} />
      ))}
    </>
  )
}

export function RecursionTree({ tree, step, onSeek }: TreeProps) {
  if (tree.total === 0) {
    return <div className="list-empty">no calls recorded</div>
  }

  // A deep trace produces thousands of calls; drawing all of them costs more
  // than it shows, so fall back to the frames that are live right now.
  const tooBig = tree.total > MAX_TREE_NODES
  const rows = tooBig ? activePath(tree, step) : tree.roots

  return (
    <div className="tree">
      <div className="tree-head">
        <span className="tree-title">Recursion tree</span>
        <span className="tree-meta">
          {tree.total} call{tree.total === 1 ? '' : 's'} · max depth {tree.maxDepth}
        </span>
      </div>

      <div className="tree-body">
        {tooBig ? (
          <>
            <div className="tree-note">
              {tree.total} calls — showing the active path only
            </div>
            {rows.map((node) => (
              <Row key={node.id} node={node} step={step} onSeek={onSeek} indent={node.depth} />
            ))}
          </>
        ) : (
          rows.map((node) => <Branch key={node.id} node={node} step={step} onSeek={onSeek} />)
        )}
      </div>
    </div>
  )
}
