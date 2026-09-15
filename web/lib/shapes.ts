// Structural models for the semantic renderers.
//
// The tracer only knows structure: a graph is a dict of lists, a tree and a
// linked list are both just objects holding refs. These builders turn that back
// into the shape the user meant, and report which heap ids they absorbed so the
// canvas does not also draw them standalone.

import { cellText } from './format.ts'
import type { Frame, HeapObj, Val } from './trace/types.ts'

export const MAX_NODES = 300

/** Field names that usually carry the payload of a node. */
const LABEL_FIELDS = ['key', 'val', 'value', 'data', 'item', 'name', 'id']
const NEXT_FIELDS = ['next', 'nxt']
const LEFT_FIELDS = ['left', 'l']
const RIGHT_FIELDS = ['right', 'r']

function refOf(val: Val | undefined): string | null {
  if (!val || !('ref' in val)) return null
  return val.ref
}

function firstField(obj: Extract<HeapObj, { kind: 'obj' }>, names: string[]): Val | undefined {
  for (const name of names) {
    if (name in obj.fields) return obj.fields[name]
  }
  return undefined
}

/** A short label for a node object: its payload field, else its class. */
export function labelOf(obj: HeapObj | undefined, heap: Record<string, HeapObj>): string {
  if (!obj || obj.kind !== 'obj') return '·'

  const payload = firstField(obj, LABEL_FIELDS)
  if (payload) return cellText(payload, heap)

  for (const value of Object.values(obj.fields)) {
    if (!('ref' in value)) return cellText(value, heap)
  }
  return obj.cls
}

// ── Graph: dict[key] = list ────────────────────────────────────────────────

export type GraphNode = { id: string; label: string }
export type GraphEdge = {
  id: string
  from: string
  to: string
  /**
   * True when the adjacency also lists the reverse. An undirected graph is
   * stored as both directions, so drawing each entry would put two lines with
   * opposing arrowheads between every pair — and imply a direction the graph
   * does not have. The pair is folded into one edge, drawn without arrows.
   */
  mutual: boolean
}
export type GraphModel = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  consumed: Set<string>
}

export function buildGraph(
  obj: HeapObj | undefined,
  heap: Record<string, HeapObj>,
): GraphModel | null {
  if (!obj || obj.kind !== 'dict') return null

  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const consumed = new Set<string>()
  /** "from|to" -> index in `edges`, so a reverse entry can find its partner. */
  const placed = new Map<string, number>()

  const ensure = (label: string) => {
    if (!nodes.has(label)) nodes.set(label, { id: label, label })
    return label
  }

  for (const [key, value] of obj.entries) {
    const from = ensure(cellText(key, heap))

    const listRef = refOf(value)
    if (!listRef) continue
    const neighbours = heap[listRef]
    if (!neighbours || !('items' in neighbours)) continue

    // The adjacency list is drawn as edges, so it is no longer a list to draw.
    consumed.add(listRef)

    for (const item of neighbours.items) {
      const to = ensure(cellText(item, heap))

      // `b` already lists `a`: fold the pair rather than drawing it twice.
      const back = placed.get(`${to}|${from}`)
      if (back !== undefined && to !== from) {
        edges[back].mutual = true
        continue
      }
      // A repeated neighbour is the same edge, not a second one.
      if (placed.has(`${from}|${to}`)) continue

      placed.set(`${from}|${to}`, edges.length)
      edges.push({ id: `${from}->${to}#${edges.length}`, from, to, mutual: false })
    }
  }

  if (nodes.size === 0 || nodes.size > MAX_NODES) return null
  return { nodes: [...nodes.values()], edges, consumed }
}

/**
 * Which graph nodes are visited, and which locals point at one.
 *
 * Read from the data rather than from names: a set whose members are all node
 * ids is a visited set whatever it is called, and a scalar local equal to a
 * node id is pointing at that node.
 */
export function graphHighlights(
  frame: Frame | null,
  heap: Record<string, HeapObj>,
  model: GraphModel,
): { visited: Set<string>; pointers: Map<string, string[]> } {
  const visited = new Set<string>()
  const pointers = new Map<string, string[]>()
  if (!frame) return { visited, pointers }

  const ids = new Set(model.nodes.map((node) => node.id))

  for (const [name, val] of Object.entries(frame.locals)) {
    if ('ref' in val) {
      const obj = heap[val.ref]
      if (!obj || obj.kind !== 'set' || obj.items.length === 0) continue
      const labels = obj.items.map((item) => cellText(item, heap))
      if (labels.every((label) => ids.has(label))) {
        for (const label of labels) visited.add(label)
      }
      continue
    }

    const label = cellText(val, heap)
    if (!ids.has(label)) continue
    const bucket = pointers.get(label) ?? []
    bucket.push(name)
    pointers.set(label, bucket)
  }

  return { visited, pointers }
}

// ── Binary tree: .left / .right ────────────────────────────────────────────

export type TreeNodeModel = {
  ref: string
  label: string
  left: TreeNodeModel | null
  right: TreeNodeModel | null
}

export type TreeModel = {
  root: TreeNodeModel
  size: number
  consumed: Set<string>
}

export function buildBinaryTree(
  rootRef: string | null,
  heap: Record<string, HeapObj>,
): TreeModel | null {
  if (!rootRef) return null

  const consumed = new Set<string>()
  let size = 0

  const walk = (ref: string | null): TreeNodeModel | null => {
    if (!ref || size >= MAX_NODES) return null
    // A back edge would otherwise recurse forever; a tree must not revisit.
    if (consumed.has(ref)) return null

    const obj = heap[ref]
    if (!obj || obj.kind !== 'obj') return null

    consumed.add(ref)
    size++

    const node: TreeNodeModel = {
      ref,
      label: labelOf(obj, heap),
      left: null,
      right: null,
    }
    node.left = walk(refOf(firstField(obj, LEFT_FIELDS)))
    node.right = walk(refOf(firstField(obj, RIGHT_FIELDS)))
    return node
  }

  const root = walk(rootRef)
  if (!root) return null
  return { root, size, consumed }
}

/** True when an object looks like a binary tree node rather than a list node. */
export function looksLikeTreeNode(obj: HeapObj | undefined): boolean {
  if (!obj || obj.kind !== 'obj') return false
  const fields = Object.keys(obj.fields)
  return (
    LEFT_FIELDS.some((name) => fields.includes(name)) &&
    RIGHT_FIELDS.some((name) => fields.includes(name))
  )
}

// ── Linked list: .next ─────────────────────────────────────────────────────

export type LinkedNode = { ref: string; label: string }
export type LinkedModel = {
  nodes: LinkedNode[]
  cyclic: boolean
  consumed: Set<string>
}

export function buildLinkedList(
  headRef: string | null,
  heap: Record<string, HeapObj>,
): LinkedModel | null {
  if (!headRef) return null

  const nodes: LinkedNode[] = []
  const consumed = new Set<string>()
  let ref: string | null = headRef
  let cyclic = false

  while (ref && nodes.length < MAX_NODES) {
    if (consumed.has(ref)) {
      cyclic = true
      break
    }
    const obj: HeapObj | undefined = heap[ref]
    if (!obj || obj.kind !== 'obj') break

    consumed.add(ref)
    nodes.push({ ref, label: labelOf(obj, heap) })
    ref = refOf(firstField(obj, NEXT_FIELDS))
  }

  if (nodes.length === 0) return null
  return { nodes, cyclic, consumed }
}

export function looksLikeLinkedNode(obj: HeapObj | undefined): boolean {
  if (!obj || obj.kind !== 'obj') return false
  if (looksLikeTreeNode(obj)) return false
  return NEXT_FIELDS.some((name) => name in obj.fields)
}

// ── Binary heap: a list read as 2i+1 / 2i+2 ────────────────────────────────

export type HeapNodeModel = {
  index: number
  label: string
  left: HeapNodeModel | null
  right: HeapNodeModel | null
}

export type HeapModel = {
  root: HeapNodeModel
  size: number
}

export function buildHeapTree(
  obj: HeapObj | undefined,
  heap: Record<string, HeapObj>,
): HeapModel | null {
  if (!obj || !('items' in obj) || obj.items.length === 0) return null
  if (obj.items.length > MAX_NODES) return null

  const items = obj.items

  const walk = (index: number): HeapNodeModel | null => {
    if (index >= items.length) return null
    return {
      index,
      label: cellText(items[index], heap),
      left: walk(2 * index + 1),
      right: walk(2 * index + 2),
    }
  }

  const root = walk(0)
  if (!root) return null
  return { root, size: items.length }
}
