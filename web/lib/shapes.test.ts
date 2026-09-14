// Shape builders and the renderer registry, checked against the fixtures whose
// @viz hints name each renderer.

import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { innermostFrame } from './infer.ts'
import { MIN_SHAPE_NODES, planCanvas } from './renderers.ts'
import {
  buildBinaryTree,
  buildGraph,
  buildHeapTree,
  buildLinkedList,
  graphHighlights,
  looksLikeLinkedNode,
  looksLikeTreeNode,
} from './shapes.ts'
import { replay } from './trace/reconstruct.ts'
import type { HeapObj, Snapshot, Trace } from './trace/types.ts'

const FIXTURES = new URL('../../fixtures/', import.meta.url)

function load(name: string): Trace {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8'))
}

function steps(name: string): Snapshot[] {
  const out: Snapshot[] = []
  replay(load(name), (_i, snapshot) => out.push(structuredClone(snapshot)))
  return out
}

function refOfLocal(snapshot: Snapshot, name: string): string | null {
  const val = innermostFrame(snapshot)?.locals[name]
  return val && 'ref' in val ? val.ref : null
}

describe('graph from dict of lists', () => {
  const snapshots = steps('bfs_graph')

  it('builds 6 nodes and 12 directed edges from the adjacency map', () => {
    const last = snapshots[snapshots.length - 1]
    const adjRef = refOfLocal(last, 'adj')!
    const model = buildGraph(last.heap[adjRef], last.heap)!

    assert.ok(model)
    assert.deepEqual(
      model.nodes.map((node) => node.id).sort(),
      ['0', '1', '2', '3', '4', '5'],
    )
    // 6 undirected edges recorded in both directions.
    assert.equal(model.edges.length, 12)
  })

  it('absorbs the adjacency lists so they are not drawn twice', () => {
    const last = snapshots[snapshots.length - 1]
    const adjRef = refOfLocal(last, 'adj')!
    const adj = last.heap[adjRef] as Extract<HeapObj, { kind: 'dict' }>
    const model = buildGraph(adj, last.heap)!

    assert.equal(model.consumed.size, 6)
    for (const [, value] of adj.entries) {
      assert.ok('ref' in value && model.consumed.has(value.ref))
    }
  })

  it('reads the visited set without being told its name', () => {
    const late = snapshots[Math.floor(snapshots.length * 0.8)]
    const adjRef = refOfLocal(late, 'adj')
    if (!adjRef) return

    const model = buildGraph(late.heap[adjRef], late.heap)!
    const marks = graphHighlights(innermostFrame(late), late.heap, model)

    assert.ok(marks.visited.size > 0, 'expected visited nodes')
    for (const id of marks.visited) {
      assert.ok(model.nodes.some((node) => node.id === id))
    }
  })

  it('grows the visited set as the search proceeds', () => {
    const sizes: number[] = []
    for (const step of snapshots) {
      const adjRef = refOfLocal(step, 'adj')
      if (!adjRef) continue
      const model = buildGraph(step.heap[adjRef], step.heap)
      if (!model) continue
      sizes.push(graphHighlights(innermostFrame(step), step.heap, model).visited.size)
    }
    assert.ok(sizes.length > 5)
    assert.ok(Math.max(...sizes) > Math.min(...sizes))
  })

  it('returns null for something that is not a dict', () => {
    assert.equal(buildGraph({ kind: 'list', items: [] }, {}), null)
    assert.equal(buildGraph(undefined, {}), null)
  })
})

describe('binary tree from left/right', () => {
  const snapshots = steps('bst_insert')

  it('builds the whole tree from the root ref', () => {
    const last = snapshots[snapshots.length - 1]
    const rootRef = refOfLocal(last, 'root')!
    const model = buildBinaryTree(rootRef, last.heap)!

    assert.ok(model)
    assert.equal(model.root.label, '50')
    assert.equal(model.size, 6, 'six keys are inserted')
  })

  it('keeps the ordering invariant of the BST', () => {
    const last = snapshots[snapshots.length - 1]
    const model = buildBinaryTree(refOfLocal(last, 'root')!, last.heap)!

    const inorder: number[] = []
    const walk = (node: typeof model.root | null) => {
      if (!node) return
      walk(node.left)
      inorder.push(Number(node.label))
      walk(node.right)
    }
    walk(model.root)

    assert.deepEqual(inorder, [...inorder].sort((a, b) => a - b))
    assert.deepEqual(inorder, [20, 30, 40, 50, 60, 70])
  })

  it('recognises a tree node by its fields', () => {
    const last = snapshots[snapshots.length - 1]
    const rootRef = refOfLocal(last, 'root')!
    assert.ok(looksLikeTreeNode(last.heap[rootRef]))
    assert.ok(!looksLikeLinkedNode(last.heap[rootRef]))
  })

  it('survives a cycle instead of recursing forever', () => {
    const heap: Record<string, HeapObj> = {
      a: { kind: 'obj', cls: 'Node', fields: { key: { v: 1 }, left: { ref: 'b' }, right: { v: null } } },
      b: { kind: 'obj', cls: 'Node', fields: { key: { v: 2 }, left: { ref: 'a' }, right: { v: null } } },
    }
    const model = buildBinaryTree('a', heap)!
    assert.equal(model.size, 2)
    assert.equal(model.root.left?.left, null)
  })
})

describe('linked list from next', () => {
  const snapshots = steps('linked_list_reverse')

  it('walks the chain in order', () => {
    const last = snapshots[snapshots.length - 1]
    const model = buildLinkedList(refOfLocal(last, 'head')!, last.heap)!

    assert.deepEqual(
      model.nodes.map((node) => node.label),
      ['5', '4', '3', '2', '1'],
    )
    assert.equal(model.cyclic, false)
  })

  it('absorbs every node it drew', () => {
    const last = snapshots[snapshots.length - 1]
    const model = buildLinkedList(refOfLocal(last, 'head')!, last.heap)!
    assert.equal(model.consumed.size, model.nodes.length)
  })

  it('reports a cycle rather than looping', () => {
    const heap: Record<string, HeapObj> = {
      a: { kind: 'obj', cls: 'Node', fields: { val: { v: 1 }, next: { ref: 'b' } } },
      b: { kind: 'obj', cls: 'Node', fields: { val: { v: 2 }, next: { ref: 'a' } } },
    }
    const model = buildLinkedList('a', heap)!
    assert.equal(model.nodes.length, 2)
    assert.equal(model.cyclic, true)
  })
})

describe('heap tree from list indices', () => {
  const snapshots = steps('heap_ops')

  it('places children at 2i+1 and 2i+2', () => {
    const model = buildHeapTree({ kind: 'list', items: [1, 3, 2, 5, 9, 8].map((v) => ({ v })) }, {})!

    assert.equal(model.size, 6)
    assert.equal(model.root.label, '1')
    assert.equal(model.root.left?.label, '3')
    assert.equal(model.root.right?.label, '2')
    assert.equal(model.root.left?.left?.label, '5')
    assert.equal(model.root.left?.right?.label, '9')
    assert.equal(model.root.right?.left?.label, '8')
  })

  it('keeps the min at the root through the whole fixture', () => {
    for (const step of snapshots) {
      const ref = refOfLocal(step, 'h')
      if (!ref) continue
      const obj = step.heap[ref]
      if (!obj || !('items' in obj) || obj.items.length === 0) continue

      const model = buildHeapTree(obj, step.heap)!
      const values = obj.items.map((item) => ('v' in item ? Number(item.v) : NaN))
      assert.equal(Number(model.root.label), Math.min(...values))
    }
  })

  it('returns null for an empty list', () => {
    assert.equal(buildHeapTree({ kind: 'list', items: [] }, {}), null)
  })
})

describe('registry routing', () => {
  const plansFor = (name: string, pick: (steps: Snapshot[]) => Snapshot) => {
    const trace = load(name)
    const all = steps(name)
    return planCanvas(pick(all), trace.meta.viz)
  }

  it('routes @viz graph to the graph renderer', () => {
    const { plans } = plansFor('bfs_graph', (all) => all[all.length - 1])
    const adj = plans.find((plan) => plan.name === 'adj')
    assert.equal(adj?.kind, 'graph')
  })

  it('routes @viz tree to the tree renderer', () => {
    const { plans } = plansFor('bst_insert', (all) => all[all.length - 1])
    const root = plans.find((plan) => plan.name === 'root')
    assert.equal(root?.kind, 'tree')
  })

  it('routes @viz linkedlist to the linked list renderer', () => {
    const { plans } = plansFor('linked_list_reverse', (all) => all[all.length - 1])
    const head = plans.find((plan) => plan.name === 'head')
    assert.equal(head?.kind, 'linkedlist')
  })

  it('routes @viz heap to the heap renderer', () => {
    const { plans } = plansFor('heap_ops', (all) => all[Math.floor(all.length / 3)])
    const h = plans.find((plan) => plan.name === 'h')
    assert.ok(h, 'expected h to be planned')
    assert.equal(h.kind, 'heap')
  })

  it('falls back to structure when nothing is hinted', () => {
    const { plans } = plansFor('binary_search', (all) => all[all.length - 1])
    const arr = plans.find((plan) => plan.name === 'arr')
    assert.equal(arr?.kind, 'list')
  })

  it('stops drawing adjacency lists separately once the graph owns them', () => {
    const { plans, consumed } = plansFor('bfs_graph', (all) => all[all.length - 1])

    assert.equal(consumed.size, 6)
    for (const heapId of consumed) {
      assert.ok(!plans.some((plan) => plan.heapId === heapId), 'consumed object still drawn')
    }
  })

  it('draws every named object exactly once', () => {
    const { plans } = plansFor('bfs_graph', (all) => all[all.length - 1])
    const ids = plans.map((plan) => plan.heapId)
    assert.equal(new Set(ids).size, ids.length)
  })

  it('leaves dp_table untouched: no hints, so lists stay lists', () => {
    const { plans } = plansFor('dp_table', (all) => all[all.length - 1])
    assert.ok(plans.length > 1)
    for (const plan of plans) assert.equal(plan.kind, 'list')
  })

  it('never draws a subtree that is already inside another tree', () => {
    // inorder()/insert() bind `node` to a descendant while recursing. Disjoint
    // trees may legitimately coexist, but a nested one must not be drawn twice.
    const trace = load('bst_insert')
    let sawRecursion = false

    for (const snapshot of steps('bst_insert')) {
      const { plans } = planCanvas(snapshot, trace.meta.viz)
      const trees = plans.filter((plan) => plan.kind === 'tree')
      if (snapshot.stack.length > 2) sawRecursion = true

      for (const tree of trees) {
        const inside = buildBinaryTree(tree.heapId, snapshot.heap)!.consumed
        for (const other of trees) {
          if (other.heapId === tree.heapId) continue
          assert.ok(!inside.has(other.heapId), `${other.name} drawn inside ${tree.name}`)
        }
      }
    }
    assert.ok(sawRecursion, 'expected recursive steps in this fixture')
  })

  it('never draws a sub-chain that is already inside another chain', () => {
    const trace = load('linked_list_reverse')

    for (const snapshot of steps('linked_list_reverse')) {
      const { plans } = planCanvas(snapshot, trace.meta.viz)
      const chains = plans.filter((plan) => plan.kind === 'linkedlist')

      for (const chain of chains) {
        const inside = buildLinkedList(chain.heapId, snapshot.heap)!.consumed
        for (const other of chains) {
          if (other.heapId === chain.heapId) continue
          assert.ok(!inside.has(other.heapId), `${other.name} drawn inside ${chain.name}`)
        }
      }
    }
  })

  it('does not draw a one-node tree or chain as a shape', () => {
    for (const name of ['bst_insert', 'linked_list_reverse']) {
      const trace = load(name)
      for (const snapshot of steps(name)) {
        const { plans } = planCanvas(snapshot, trace.meta.viz)
        for (const plan of plans) {
          if (plan.kind === 'tree') assert.ok(plan.model.size >= MIN_SHAPE_NODES)
          if (plan.kind === 'linkedlist') {
            assert.ok(plan.model.nodes.length >= MIN_SHAPE_NODES)
          }
        }
      }
    }
  })

  it('prefers the hinted name over a shadowing local', () => {
    const trace = load('bst_insert')
    const all = steps('bst_insert')
    const deep = all.find((snapshot) => snapshot.stack.length > 2)!
    const { plans } = planCanvas(deep, trace.meta.viz)
    const tree = plans.find((plan) => plan.kind === 'tree')
    if (tree && tree.aliases.includes('node')) {
      assert.equal(tree.name, 'root')
    }
  })

  it('returns nothing for a null snapshot', () => {
    const plan = planCanvas(null, {})
    assert.deepEqual(plan.plans, [])
    assert.equal(plan.rest.length, 0)
  })
})
