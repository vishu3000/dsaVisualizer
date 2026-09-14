// The renderer registry.
//
// The tracer records structure; `# @viz <kind> <name>` records intent. This
// picks a renderer from the hint when there is one, falls back to what the
// object structurally looks like, and reports which heap ids each renderer
// absorbs so the canvas never draws the same data twice.

import { namesForRef } from './infer.ts'
import {
  buildBinaryTree,
  buildGraph,
  buildHeapTree,
  buildLinkedList,
  looksLikeLinkedNode,
  looksLikeTreeNode,
  type GraphModel,
  type HeapModel,
  type LinkedModel,
  type TreeModel,
} from './shapes.ts'
import type { HeapObj, Snapshot } from './trace/types.ts'

export type RendererKind =
  | 'list'
  | 'tuple'
  | 'deque'
  | 'dict'
  | 'set'
  | 'graph'
  | 'tree'
  | 'linkedlist'
  | 'heap'

export const VIZ_KINDS: RendererKind[] = [
  'list',
  'tuple',
  'deque',
  'dict',
  'set',
  'graph',
  'tree',
  'linkedlist',
  'heap',
]

export type RenderPlan =
  | { kind: 'graph'; heapId: string; name: string | null; aliases: string[]; model: GraphModel }
  | { kind: 'tree'; heapId: string; name: string | null; aliases: string[]; model: TreeModel }
  | {
      kind: 'linkedlist'
      heapId: string
      name: string | null
      aliases: string[]
      model: LinkedModel
    }
  | {
      kind: 'heap'
      heapId: string
      name: string | null
      aliases: string[]
      model: HeapModel
      obj: HeapObj
    }
  | {
      kind: 'list' | 'tuple' | 'deque' | 'dict' | 'set'
      heapId: string
      name: string | null
      aliases: string[]
      obj: HeapObj
    }

export type CanvasPlan = {
  plans: RenderPlan[]
  /** Heap ids drawn inside another renderer, hidden from the top level. */
  consumed: Set<string>
  /** Heap objects with no renderer at all. */
  rest: [string, HeapObj][]
}

/** Below this a tree or chain is a single object, not a shape. */
export const MIN_SHAPE_NODES = 2

function isVizKind(value: string | undefined): value is RendererKind {
  return value !== undefined && (VIZ_KINDS as string[]).includes(value)
}

/**
 * The hint wins when it fits the object; otherwise structure decides. A hint of
 * `graph` on something that is not a dict of lists falls back rather than
 * rendering nothing.
 */
function chooseKind(
  obj: HeapObj,
  hinted: RendererKind | undefined,
): RendererKind | null {
  if (hinted) {
    if (hinted === 'graph' && obj.kind === 'dict') return 'graph'
    if (hinted === 'heap' && 'items' in obj) return 'heap'
    if (hinted === 'tree' && obj.kind === 'obj') return 'tree'
    if (hinted === 'linkedlist' && obj.kind === 'obj') return 'linkedlist'
    if (hinted === obj.kind) return hinted
  }

  switch (obj.kind) {
    case 'list':
    case 'tuple':
    case 'deque':
    case 'dict':
    case 'set':
      return obj.kind
    case 'obj':
      // Nothing hinted, so read the fields: left/right is a tree, next is a chain.
      if (looksLikeTreeNode(obj)) return 'tree'
      if (looksLikeLinkedNode(obj)) return 'linkedlist'
      return null
    default:
      return null
  }
}

export function planCanvas(snapshot: Snapshot | null, viz: Record<string, string>): CanvasPlan {
  if (!snapshot) return { plans: [], consumed: new Set(), rest: [] }

  const heap = snapshot.heap
  const entries = Object.entries(heap)

  const named: [string, HeapObj, string[]][] = []
  const unnamed: [string, HeapObj][] = []

  for (const [heapId, obj] of entries) {
    const names = namesForRef(snapshot, heapId)
    if (names.length > 0) named.push([heapId, obj, names])
    else unnamed.push([heapId, obj])
  }

  const candidates: { plan: RenderPlan; consumes: Set<string> }[] = []

  for (const [heapId, obj, names] of named) {
    const hint = names.map((name) => viz[name]).find(isVizKind)
    const kind = chooseKind(obj, hint)
    if (!kind) continue

    // A recursive function shadows the outer name (`node` over `root`); the
    // hinted name is the one that describes the whole structure.
    const ordered = [...names].sort((a, b) => Number(!!viz[b]) - Number(!!viz[a]))
    const base = { heapId, name: ordered[0], aliases: ordered.slice(1) }
    const consumes = new Set<string>()

    if (kind === 'graph') {
      const model = buildGraph(obj, heap)
      if (!model) continue
      for (const ref of model.consumed) consumes.add(ref)
      candidates.push({ plan: { kind: 'graph', ...base, model }, consumes })
    } else if (kind === 'tree') {
      const model = buildBinaryTree(heapId, heap)
      // A lone node — a freshly constructed one, say — has no structure worth
      // a diagram, and would sit beside the real tree as a second block.
      if (!model || model.size < MIN_SHAPE_NODES) continue
      for (const ref of model.consumed) if (ref !== heapId) consumes.add(ref)
      candidates.push({ plan: { kind: 'tree', ...base, model }, consumes })
    } else if (kind === 'linkedlist') {
      const model = buildLinkedList(heapId, heap)
      if (!model || model.nodes.length < MIN_SHAPE_NODES) continue
      for (const ref of model.consumed) if (ref !== heapId) consumes.add(ref)
      candidates.push({ plan: { kind: 'linkedlist', ...base, model }, consumes })
    } else if (kind === 'heap') {
      const model = buildHeapTree(obj, heap)
      if (!model) continue
      candidates.push({ plan: { kind: 'heap', ...base, model, obj }, consumes })
    } else {
      candidates.push({ plan: { kind, ...base, obj }, consumes })
    }
  }

  // A subtree or sub-chain is often bound to its own local while recursion is in
  // flight. It is already inside the enclosing drawing, so drop it rather than
  // drawing the same nodes twice.
  const claimedByOthers = (heapId: string) =>
    candidates.some((other) => other.plan.heapId !== heapId && other.consumes.has(heapId))

  const survivors = candidates.filter(({ plan }) => !claimedByOthers(plan.heapId))

  const plans: RenderPlan[] = survivors.map(({ plan }) => plan)
  const consumed = new Set<string>()
  for (const { consumes } of survivors) {
    for (const ref of consumes) consumed.add(ref)
  }
  const planned = new Set(plans.map((plan) => plan.heapId))

  // Anonymous objects keep their own block unless a renderer already drew them.
  for (const [heapId, obj] of unnamed) {
    if (consumed.has(heapId)) continue
    const kind = chooseKind(obj, undefined)
    if (!kind || kind === 'tree' || kind === 'linkedlist') continue
    plans.push({
      kind: kind as 'list' | 'tuple' | 'deque' | 'dict' | 'set',
      heapId,
      name: null,
      aliases: [],
      obj,
    })
    planned.add(heapId)
  }

  const rest = entries.filter(([heapId]) => !planned.has(heapId) && !consumed.has(heapId))
  return { plans, consumed, rest }
}
