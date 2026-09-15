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
  | 'stack'
  | 'queue'
  /** Any other instance: drawn as a card of its fields. */
  | 'obj'

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
  'stack',
  'queue',
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
      kind: 'list' | 'tuple' | 'deque' | 'dict' | 'set' | 'stack' | 'queue' | 'obj'
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

/** Kinds drawn as a diagram rather than a row of cells. */
const SHAPE_KINDS = new Set<RendererKind>(['graph', 'tree', 'linkedlist', 'heap'])

/**
 * Drawings a sequence of items can legitimately be given.
 *
 * A stack and a queue are both `list`, so nothing in a snapshot tells them
 * apart — the choice is the reader's, made either in the source with `@viz`
 * or from the canvas. The other heap kinds are not offered: a dict is not a
 * queue however you squint at it.
 */
export const SEQUENCE_KINDS = ['list', 'stack', 'queue', 'heap'] as const

/**
 * Fields that usually hold what a wrapper class is wrapping.
 *
 * A hand-written Queue or Stack keeps its elements in one of these and its
 * bookkeeping in the rest, so `@viz queue q` means the field, not the object.
 */
const PAYLOAD_FIELDS = ['items', 'data', 'values', 'elements', 'buffer', 'arr', 'list']

/** True when this block's drawing is a choice rather than a fact. */
export function isRetargetable(kind: RendererKind): boolean {
  return (SEQUENCE_KINDS as readonly string[]).includes(kind) || kind === 'deque' || kind === 'tuple'
}

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
    // A stack and a queue are both lists; only the hint says which. `list`
    // is here too so the hint can pull a deque back to a plain row of cells,
    // which `hinted === obj.kind` below would never do.
    if (hinted === 'stack' && 'items' in obj) return 'stack'
    if (hinted === 'queue' && 'items' in obj) return 'queue'
    if (hinted === 'list' && 'items' in obj) return 'list'
    // `@viz deque` names the type, not a separate drawing: a deque is a queue.
    if (hinted === 'deque' && 'items' in obj) return 'queue'
    if (hinted === obj.kind) return hinted
  }

  switch (obj.kind) {
    // A deque exists to be pushed and popped at the ends, so it draws as a
    // queue unless something says otherwise.
    case 'deque':
      return 'queue'
    case 'list':
    case 'tuple':
    case 'dict':
    case 'set':
      return obj.kind
    case 'obj':
      // Nothing hinted, so read the fields: left/right is a tree, next is a
      // chain, and anything else is drawn as the object it is rather than not
      // at all — a hand-written Queue used to produce an empty canvas.
      if (looksLikeTreeNode(obj)) return 'tree'
      if (looksLikeLinkedNode(obj)) return 'linkedlist'
      return 'obj'
    default:
      return null
  }
}

/**
 * The container a hint on an instance is really pointing at.
 *
 * `@viz queue q` on a hand-written Queue used to do nothing: the hint asks
 * whether the object has `items`, and an instance keeps its payload under
 * `fields`, so the check never matched. The hint means the collection inside,
 * and that is what it now resolves to.
 */
export function hintedField(
  obj: HeapObj,
  heap: Record<string, HeapObj>,
  hinted: RendererKind,
): { heapId: string; obj: HeapObj } | null {
  if (obj.kind !== 'obj') return null

  const candidate = (val: { ref: string } | { v: unknown } | undefined) => {
    if (!val || !('ref' in val)) return null
    const target = heap[val.ref]
    // Only a container: redirecting onto another instance would move the
    // problem one level down rather than solve it.
    if (!target || !('items' in target || target.kind === 'dict')) return null
    return chooseKind(target, hinted) ? { heapId: val.ref, obj: target } : null
  }

  for (const name of PAYLOAD_FIELDS) {
    const hit = candidate(obj.fields[name])
    if (hit) return hit
  }
  for (const val of Object.values(obj.fields)) {
    const hit = candidate(val)
    if (hit) return hit
  }
  return null
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

  for (const [heapId, sourceObj, names] of named) {
    const hint = names.map((name) => viz[name]).find(isVizKind)

    // `@viz queue q` on a hand-written Queue means the collection it holds.
    const redirect = hint ? hintedField(sourceObj, heap, hint) : null
    const obj = redirect?.obj ?? sourceObj
    const drawnId = redirect?.heapId ?? heapId

    const kind = chooseKind(obj, hint)
    if (!kind) continue

    // A recursive function shadows the outer name (`node` over `root`); the
    // hinted name is the one that describes the whole structure.
    const ordered = [...names].sort((a, b) => Number(!!viz[b]) - Number(!!viz[a]))
    const base = { heapId: drawnId, name: ordered[0], aliases: ordered.slice(1) }
    const consumes = new Set<string>()
    // The wrapper is represented by the field being drawn, so it is not also
    // an undrawn object.
    if (redirect) consumes.add(heapId)

    if (kind === 'graph') {
      const model = buildGraph(obj, heap)
      if (!model) continue
      for (const ref of model.consumed) consumes.add(ref)
      candidates.push({ plan: { kind: 'graph', ...base, model }, consumes })
    } else if (kind === 'tree') {
      const model = buildBinaryTree(drawnId, heap)
      // A lone node — a freshly constructed one, say — has no structure worth
      // a diagram. It falls back to the object card rather than vanishing; if
      // it belongs to a bigger tree, claimedByOthers drops it below.
      if (!model || model.size < MIN_SHAPE_NODES) {
        candidates.push({ plan: { kind: 'obj', ...base, obj }, consumes })
        continue
      }
      for (const ref of model.consumed) if (ref !== drawnId) consumes.add(ref)
      candidates.push({ plan: { kind: 'tree', ...base, model }, consumes })
    } else if (kind === 'linkedlist') {
      const model = buildLinkedList(drawnId, heap)
      if (!model || model.nodes.length < MIN_SHAPE_NODES) {
        candidates.push({ plan: { kind: 'obj', ...base, obj }, consumes })
        continue
      }
      for (const ref of model.consumed) if (ref !== drawnId) consumes.add(ref)
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

  // Objects no local points at are not drawn. They were given a block titled
  // by their id() — `#85568` — which names a memory address and nothing a
  // reader can act on, and there were six of them in bfs_graph for one list of
  // tuples. The named block they belong to shows their contents now, and the
  // raw dump below still holds every one of them.

  // Shapes first: a graph or tree is what the reader came for, and it was
  // landing below the flat blocks rather than at the top of the panel.
  const ordered = plans
    .map((plan, index) => ({ plan, index }))
    .sort(
      (a, b) =>
        Number(SHAPE_KINDS.has(b.plan.kind)) - Number(SHAPE_KINDS.has(a.plan.kind)) ||
        a.index - b.index,
    )
    .map(({ plan }) => plan)

  const rest = entries.filter(([heapId]) => !planned.has(heapId) && !consumed.has(heapId))
  return { plans: ordered, consumed, rest }
}
