// Dict and set rendering inputs.
//
// Note on fixtures: dp_table holds only lists (511 list objects, no dict, no
// set), so it cannot exercise these renderers. It is checked here for the
// absence of regression, and the real verification runs against bfs_graph,
// dfs_recursive and sliding_window, which are the fixtures that carry dicts
// and sets.

import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formatVal, previewHeap } from './format.ts'
import { mutatedEntries, mutatedMembers, valKey } from './infer.ts'
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

function kindsIn(snapshots: Snapshot[]): Set<string> {
  const kinds = new Set<string>()
  for (const step of snapshots) {
    for (const obj of Object.values(step.heap)) kinds.add(obj.kind)
  }
  return kinds
}

describe('dp_table (named in the request)', () => {
  const snapshots = steps('dp_table')

  it('contains no dict or set to render', () => {
    const kinds = kindsIn(snapshots)
    assert.deepEqual([...kinds], ['list'])
    assert.ok(!kinds.has('dict'))
    assert.ok(!kinds.has('set'))
  })

  it('still renders its lists unchanged', () => {
    const last = snapshots[snapshots.length - 1]
    const lists = Object.values(last.heap).filter((obj) => obj.kind === 'list')
    assert.ok(lists.length > 0)
    for (const obj of lists) {
      assert.ok('items' in obj)
    }
  })

  it('the outer table previews as rows of lists', () => {
    const last = snapshots[snapshots.length - 1]
    const table = Object.values(last.heap).find(
      (obj) => obj.kind === 'list' && obj.items.every((item) => 'ref' in item) && obj.items.length > 1,
    )
    assert.ok(table, 'expected a list of lists')
    assert.match(previewHeap(table, last.heap), /^\[list\[\d+\]/)
  })
})

describe('valKey', () => {
  it('separates primitives by value and type', () => {
    assert.notEqual(valKey({ v: 1 }), valKey({ v: '1' }))
    assert.equal(valKey({ v: 1 }), valKey({ v: 1 }))
    assert.notEqual(valKey({ v: null }), valKey({ v: 0 }))
  })

  it('separates heap objects by reference', () => {
    assert.equal(valKey({ ref: 'a' }), valKey({ ref: 'a' }))
    assert.notEqual(valKey({ ref: 'a' }), valKey({ ref: 'b' }))
  })
})

describe('dict buckets on bfs_graph', () => {
  const snapshots = steps('bfs_graph')

  it('has dicts to draw', () => {
    assert.ok(kindsIn(snapshots).has('dict'))
  })

  it('renders every entry as a key and a value', () => {
    for (const step of snapshots) {
      for (const obj of Object.values(step.heap)) {
        if (obj.kind !== 'dict') continue
        for (const [key, value] of obj.entries) {
          assert.equal(typeof formatVal(key, step.heap), 'string')
          assert.equal(typeof formatVal(value, step.heap), 'string')
        }
      }
    }
  })

  it('shows adjacency values as referenced lists, never inlined', () => {
    const last = snapshots[snapshots.length - 1]
    const adjRef = (last.stack[last.stack.length - 1].locals.adj as { ref: string }).ref
    const adj = last.heap[adjRef] as Extract<HeapObj, { kind: 'dict' }>

    assert.equal(adj.kind, 'dict')
    assert.equal(adj.entries.length, 6)
    for (const [, value] of adj.entries) {
      assert.ok('ref' in value)
      assert.match(formatVal(value, last.heap), /^list\[\d+\]$/)
    }
  })

  it('flags a new key as mutated exactly once', () => {
    let firstFlagged: number | null = null
    let stillFlagged = 0

    for (let i = 1; i < snapshots.length; i++) {
      const step = snapshots[i]
      const distRef = step.stack[step.stack.length - 1].locals.dist
      if (!distRef || !('ref' in distRef)) continue

      const current = step.heap[distRef.ref]
      const before = snapshots[i - 1].heap[distRef.ref]
      const mutated = mutatedEntries(current, before)

      if (mutated.size > 0) {
        if (firstFlagged === null) firstFlagged = i
        // the same key must not stay flagged on the following step
        const next = snapshots[i + 1]
        if (next) {
          const after = mutatedEntries(next.heap[distRef.ref], current)
          for (const key of mutated) if (after.has(key)) stillFlagged++
        }
      }
    }

    assert.notEqual(firstFlagged, null, 'expected dist to gain keys')
    assert.equal(stillFlagged, 0, 'a mutation should last one step')
  })
})

describe('set buckets on sliding_window', () => {
  const snapshots = steps('sliding_window')

  it('has sets to draw', () => {
    assert.ok(kindsIn(snapshots).has('set'))
  })

  it('flags added members and not surviving ones', () => {
    let sawAddition = false

    for (let i = 1; i < snapshots.length; i++) {
      const step = snapshots[i]
      const seen = step.stack[step.stack.length - 1].locals.seen
      if (!seen || !('ref' in seen)) continue

      const current = step.heap[seen.ref]
      const before = snapshots[i - 1].heap[seen.ref]
      if (!current || !before || !('items' in current) || !('items' in before)) continue

      const mutated = mutatedMembers(current, before)
      const beforeKeys = new Set(before.items.map(valKey))
      for (const id of mutated) {
        assert.ok(!beforeKeys.has(id), 'only new members are flagged')
        sawAddition = true
      }
    }

    assert.ok(sawAddition, 'expected the window set to gain members')
  })

  it('flags nothing when a member is removed', () => {
    const before = { kind: 'set', items: [{ v: 'a' }, { v: 'b' }] } as HeapObj
    const after = { kind: 'set', items: [{ v: 'b' }] } as HeapObj
    assert.equal(mutatedMembers(after, before).size, 0)
  })

  it('ignores reordering, which Python does freely', () => {
    const before = { kind: 'set', items: [{ v: 1 }, { v: 2 }, { v: 3 }] } as HeapObj
    const after = { kind: 'set', items: [{ v: 3 }, { v: 1 }, { v: 2 }] } as HeapObj
    assert.equal(mutatedMembers(after, before).size, 0)
  })
})

describe('dict mutation semantics', () => {
  const dict = (entries: [unknown, unknown][]) =>
    ({ kind: 'dict', entries } as unknown as HeapObj)

  it('flags a changed value', () => {
    const before = dict([[{ v: 'a' }, { v: 1 }]])
    const after = dict([[{ v: 'a' }, { v: 2 }]])
    assert.deepEqual([...mutatedEntries(after, before)], [valKey({ v: 'a' })])
  })

  it('flags a new key', () => {
    const before = dict([[{ v: 'a' }, { v: 1 }]])
    const after = dict([
      [{ v: 'a' }, { v: 1 }],
      [{ v: 'b' }, { v: 2 }],
    ])
    assert.deepEqual([...mutatedEntries(after, before)], [valKey({ v: 'b' })])
  })

  it('flags nothing when only order changes', () => {
    const before = dict([
      [{ v: 'a' }, { v: 1 }],
      [{ v: 'b' }, { v: 2 }],
    ])
    const after = dict([
      [{ v: 'b' }, { v: 2 }],
      [{ v: 'a' }, { v: 1 }],
    ])
    assert.equal(mutatedEntries(after, before).size, 0)
  })

  it('flags nothing without a previous step', () => {
    assert.equal(mutatedEntries(dict([[{ v: 'a' }, { v: 1 }]]), undefined).size, 0)
  })
})

describe('dfs_recursive carries both kinds', () => {
  it('draws a dict and a set in the same snapshot', () => {
    const snapshots = steps('dfs_recursive')
    const both = snapshots.find((step) => {
      const kinds = new Set(Object.values(step.heap).map((obj) => obj.kind))
      return kinds.has('dict') && kinds.has('set')
    })
    assert.ok(both, 'expected a step holding both adj and visited')
  })
})
