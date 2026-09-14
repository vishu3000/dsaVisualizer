// The recursion tree, built from the trace's call and return events.
//
// Every 'call' opens a node and pushes it; every 'return' closes the node on
// top. CPython emits a return even when a frame is unwound by an exception, so
// the two stay balanced; a truncated trace simply leaves its open frames with
// returnStep === null.

import { formatVal } from './format.ts'
import { replay } from './trace/reconstruct.ts'
import type { Trace } from './trace/types.ts'

export type CallStatus = 'done' | 'active' | 'pending'

export type CallNode = {
  /** The step index of the call event — unique, and a stable React key. */
  id: number
  fn: string
  depth: number
  callStep: number
  returnStep: number | null
  args: { name: string; value: string }[]
  children: CallNode[]
}

export type CallTree = {
  roots: CallNode[]
  total: number
  maxDepth: number
}

/** Past this many calls the full tree stops being readable; show the path only. */
export const MAX_TREE_NODES = 400

export const EMPTY_TREE: CallTree = { roots: [], total: 0, maxDepth: 0 }

export function buildCallTree(trace: Trace | null): CallTree {
  if (!trace || trace.meta.steps === 0) return EMPTY_TREE

  const roots: CallNode[] = []
  const open: CallNode[] = []
  let total = 0
  let maxDepth = 0

  replay(trace, (index, snapshot) => {
    const frame = snapshot.stack[snapshot.stack.length - 1]

    if (snapshot.event === 'call' && frame) {
      // At a call event only the parameters are bound, so the locals are
      // exactly the arguments this frame was invoked with.
      const node: CallNode = {
        id: index,
        fn: frame.fn,
        depth: open.length,
        callStep: index,
        returnStep: null,
        args: Object.entries(frame.locals).map(([name, val]) => ({
          name,
          value: formatVal(val, snapshot.heap),
        })),
        children: [],
      }

      const parent = open[open.length - 1]
      if (parent) parent.children.push(node)
      else roots.push(node)

      open.push(node)
      total++
      maxDepth = Math.max(maxDepth, open.length)
      return
    }

    if (snapshot.event === 'return') {
      const node = open.pop()
      if (node) node.returnStep = index
    }
  })

  return { roots, total, maxDepth }
}

export function statusOf(node: CallNode, step: number): CallStatus {
  if (node.callStep > step) return 'pending'
  if (node.returnStep !== null && node.returnStep < step) return 'done'
  return 'active'
}

/** The chain of frames live at `step`, outermost first. */
export function activePath(tree: CallTree, step: number): CallNode[] {
  const path: CallNode[] = []

  let level = tree.roots
  for (;;) {
    const node = level.find((candidate) => statusOf(candidate, step) === 'active')
    if (!node) break
    path.push(node)
    level = node.children
  }
  return path
}
