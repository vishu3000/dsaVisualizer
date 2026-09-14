// The recursion tree is checked against dfs_recursive and backtracking_subsets,
// the two fixtures whose whole point is nesting.

import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { activePath, buildCallTree, statusOf, type CallNode, type CallTree } from './callTree.ts'
import { reconstruct, replay } from './trace/reconstruct.ts'
import type { Trace } from './trace/types.ts'

const FIXTURES = new URL('../../fixtures/', import.meta.url)

function load(name: string): Trace {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8'))
}

function flatten(tree: CallTree): CallNode[] {
  const out: CallNode[] = []
  const walk = (node: CallNode) => {
    out.push(node)
    node.children.forEach(walk)
  }
  tree.roots.forEach(walk)
  return out
}

describe('replay', () => {
  it('yields the same snapshots as reconstruct, in one pass', () => {
    const trace = load('dfs_recursive')
    const seen: number[] = []

    replay(trace, (index, snapshot) => {
      seen.push(index)
      assert.deepStrictEqual(snapshot, reconstruct(trace, index), `step ${index}`)
    })

    assert.equal(seen.length, trace.meta.steps)
    assert.deepEqual(seen, [...Array(trace.meta.steps).keys()])
  })
})

describe('buildCallTree', () => {
  for (const name of ['dfs_recursive', 'backtracking_subsets', 'bst_insert', 'binary_search']) {
    it(`${name}: every call is balanced by a return`, () => {
      const tree = buildCallTree(load(name))
      for (const node of flatten(tree)) {
        assert.notEqual(node.returnStep, null, `${node.fn} never returned`)
        assert.ok(node.returnStep! > node.callStep)
      }
    })

    it(`${name}: children are nested inside their parent's lifetime`, () => {
      const tree = buildCallTree(load(name))
      for (const node of flatten(tree)) {
        for (const child of node.children) {
          assert.ok(child.callStep > node.callStep)
          assert.ok(child.returnStep! <= node.returnStep!)
          assert.equal(child.depth, node.depth + 1)
        }
      }
    })

    it(`${name}: tree depth matches the deepest stack in the trace`, () => {
      const trace = load(name)
      const tree = buildCallTree(trace)

      let deepest = 0
      replay(trace, (_index, snapshot) => {
        deepest = Math.max(deepest, snapshot.stack.length)
      })
      assert.equal(tree.maxDepth, deepest)
    })

    it(`${name}: the active path matches the live stack at every step`, () => {
      const trace = load(name)
      const tree = buildCallTree(trace)

      for (let i = 0; i < trace.meta.steps; i++) {
        const snapshot = reconstruct(trace, i)
        const path = activePath(tree, i)
        assert.deepEqual(
          path.map((node) => node.fn),
          snapshot.stack.map((frame) => frame.fn),
          `step ${i}`,
        )
      }
    })
  }
})

describe('dfs_recursive', () => {
  const trace = load('dfs_recursive')
  const tree = buildCallTree(trace)

  it('roots at the module and recurses through dfs', () => {
    assert.equal(tree.roots.length, 1)
    assert.equal(tree.roots[0].fn, '<module>')

    const names = new Set(flatten(tree).map((node) => node.fn))
    assert.ok(names.has('dfs'))
  })

  it('recurses: dfs calls dfs', () => {
    const nested = flatten(tree).filter(
      (node) => node.fn === 'dfs' && node.children.some((child) => child.fn === 'dfs'),
    )
    assert.ok(nested.length > 0, 'expected dfs to call itself')
    assert.ok(tree.maxDepth >= 4)
  })

  it('carries the arguments each call was made with', () => {
    const calls = flatten(tree).filter((node) => node.fn === 'dfs')
    for (const call of calls) {
      const names = call.args.map((arg) => arg.name)
      assert.deepEqual(names, ['adj', 'node', 'visited', 'order'])
      const node = call.args.find((arg) => arg.name === 'node')!
      assert.match(node.value, /^\d+$/)
    }
  })

  it('visits each graph node exactly once', () => {
    const visited = flatten(tree)
      .filter((node) => node.fn === 'dfs')
      .map((node) => node.args.find((arg) => arg.name === 'node')!.value)
    assert.equal(new Set(visited).size, visited.length)
  })
})

describe('backtracking_subsets', () => {
  const trace = load('backtracking_subsets')
  const tree = buildCallTree(trace)

  it('produces one backtrack call per subset', () => {
    const calls = flatten(tree).filter((node) => node.fn === 'backtrack')
    // [1,2,3] has 2^3 subsets, and the enumeration makes one call per subset.
    assert.equal(calls.length, 8)
  })

  it('nests to the depth of the longest subset', () => {
    // <module> > subsets > backtrack(0) > backtrack(1) > backtrack(2) > backtrack(3)
    assert.equal(tree.maxDepth, 6)
  })

  it('unwinds fully by the last step', () => {
    const last = trace.meta.steps - 1
    const path = activePath(tree, last)
    assert.deepEqual(
      path.map((node) => node.fn),
      ['<module>'],
    )
  })

  it('marks siblings done once they have returned', () => {
    const subsets = flatten(tree).find((node) => node.fn === 'subsets')!
    const first = subsets.children[0]
    const inner = first.children

    assert.ok(inner.length >= 2, 'expected sibling recursive calls')
    const afterFirst = inner[0].returnStep! + 1
    assert.equal(statusOf(inner[0], afterFirst), 'done')
    assert.equal(statusOf(inner[1], afterFirst), 'pending')
  })
})

describe('empty and degenerate traces', () => {
  it('returns an empty tree for a trace with no steps', () => {
    const tree = buildCallTree({
      meta: { steps: 0, truncated: false, viz: {} },
      init: { line: 0, event: 'line', stack: [], heap: {}, stdout: '' },
      keyframes: {},
      deltas: [],
    })
    assert.deepEqual(tree, { roots: [], total: 0, maxDepth: 0 })
  })

  it('returns an empty tree for null', () => {
    assert.equal(buildCallTree(null).total, 0)
  })
})
