// Run with: node --test web/lib/trace/
//
// Ground truth is a second, deliberately independent patch applier (below).
// It replays every delta from init in sequence; reconstruct() instead jumps to
// the nearest keyframe. Asserting they agree for every step is what proves the
// keyframe walk is correct.

import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { reconstruct } from './reconstruct.ts'
import type { Snapshot, Trace } from './types.ts'

const FIXTURES = new URL('../../../fixtures/', import.meta.url)

const NAMES = [
  'binary_search',
  'two_pointer',
  'sliding_window',
  'bfs_graph',
  'dfs_recursive',
  'dp_table',
  'heap_ops',
  'linked_list_reverse',
  'bst_insert',
  'backtracking_subsets',
]

function load(name: string): Trace {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8'))
}

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function naiveApply(doc: any, op: any): void {
  const tokens = op.path
    .split('/')
    .slice(1)
    .map((t: string) => t.replace(/~1/g, '/').replace(/~0/g, '~'))

  const parent = tokens
    .slice(0, -1)
    .reduce((node: any, t: string) => (Array.isArray(node) ? node[Number(t)] : node[t]), doc)

  const key = tokens[tokens.length - 1]
  const value = 'value' in op ? deepCopy(op.value) : undefined

  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : Number(key)
    if (op.op === 'add') parent.splice(index, 0, value)
    else if (op.op === 'remove') parent.splice(index, 1)
    else parent[index] = value
  } else {
    if (op.op === 'remove') delete parent[key]
    else parent[key] = value
  }
}

/** Every snapshot, by replaying all deltas from init. No keyframes involved. */
function replayAll(trace: Trace): Snapshot[] {
  let current = deepCopy(trace.init)
  const out: Snapshot[] = [current]

  for (const delta of trace.deltas) {
    current = deepCopy(current)
    for (const op of delta) naiveApply(current, op)
    out.push(current)
  }
  return out
}

/** A well-formed Trace carrying keyframes every `interval` steps. */
function withKeyframes(trace: Trace, full: Snapshot[], interval: number): Trace {
  const keyframes: Record<number, Snapshot> = {}
  for (let i = interval; i < full.length; i += interval) {
    keyframes[i] = deepCopy(full[i])
  }
  return { ...trace, keyframes }
}

describe('reconstruct', () => {
  for (const name of NAMES) {
    describe(name, () => {
      const trace = load(name)
      const full = replayAll(trace)

      it('has the delta-encoded shape', () => {
        assert.deepEqual(Object.keys(trace).sort(), ['deltas', 'init', 'keyframes', 'meta'])
        assert.equal(trace.meta.steps, trace.deltas.length + 1)
        assert.equal(full.length, trace.meta.steps)
      })

      it('matches every full snapshot', () => {
        for (let i = 0; i <= trace.deltas.length; i++) {
          assert.deepStrictEqual(reconstruct(trace, i), full[i], `step ${i}`)
        }
      })

      it('matches when scrubbed backwards and at random', () => {
        for (let i = trace.deltas.length; i >= 0; i--) {
          assert.deepStrictEqual(reconstruct(trace, i), full[i], `step ${i}`)
        }
        const last = trace.meta.steps - 1
        for (const i of [0, last, last >> 1, 0, last]) {
          assert.deepStrictEqual(reconstruct(trace, i), full[i], `step ${i}`)
        }
      })

      for (const interval of [1, 2, 3, 7, 50]) {
        it(`matches with a keyframe every ${interval} steps`, () => {
          const keyed = withKeyframes(trace, full, interval)
          for (let i = 0; i < keyed.meta.steps; i++) {
            assert.deepStrictEqual(reconstruct(keyed, i), full[i], `step ${i}`)
          }
        })
      }

      it('does not mutate the trace', () => {
        const before = JSON.stringify(trace)
        for (let i = 0; i < trace.meta.steps; i++) {
          const snapshot = reconstruct(trace, i)
          snapshot.stack.push({ fn: 'tampered', line: 0, locals: {} })
          snapshot.heap.tampered = { kind: 'list', items: [] }
          snapshot.stdout += 'tampered'
        }
        assert.equal(JSON.stringify(trace), before)
      })

      it('rejects out-of-range steps', () => {
        const total = trace.meta.steps
        for (const bad of [-1, total, total + 100, 1.5, NaN]) {
          assert.throws(() => reconstruct(trace, bad), RangeError)
        }
      })
    })
  }

  it('starts from the keyframe rather than the beginning', () => {
    const trace = load('bst_insert')
    const full = replayAll(trace)
    const keyed = withKeyframes(trace, full, 10)

    for (let j = 0; j < 10; j++) {
      keyed.deltas[j] = [{ op: 'replace', path: '/stdout', value: 'CORRUPT' }]
    }

    assert.equal(reconstruct(keyed, 9).stdout, 'CORRUPT')
    for (let i = 10; i < keyed.meta.steps; i++) {
      assert.deepStrictEqual(reconstruct(keyed, i), full[i], `step ${i}`)
    }
  })

  it('rebuilds known values, not just self-consistent ones', () => {
    const trace = load('binary_search')
    const last = reconstruct(trace, trace.meta.steps - 1)

    assert.equal(last.stdout, '5\n')
    assert.deepEqual(last.stack[last.stack.length - 1].locals.found, { v: 5 })
    assert.equal(trace.meta.viz.arr, 'list')

    const arr = last.heap[(last.stack[last.stack.length - 1].locals.arr as { ref: string }).ref]
    assert.equal(arr.kind, 'list')
    assert.deepEqual(
      (arr as { items: { v: number }[] }).items.map((item) => item.v),
      [2, 5, 8, 12, 16, 23, 38, 56, 72, 91],
    )
  })

  it('rebuilds the reversed linked list by following refs', () => {
    const trace = load('linked_list_reverse')
    const last = reconstruct(trace, trace.meta.steps - 1)
    const heap = last.heap as Record<string, any>

    const values: number[] = []
    let ref: string | undefined = (last.stack[last.stack.length - 1].locals.head as { ref: string }).ref
    while (ref !== undefined) {
      const node = heap[ref]
      values.push(node.fields.val.v)
      ref = node.fields.next.ref
    }

    assert.deepEqual(values, [5, 4, 3, 2, 1])
  })

  it('shares one heap entry between aliased names', () => {
    const trace = load('binary_search')
    const callStep = reconstruct(trace, 5)

    assert.equal(callStep.event, 'call')
    assert.equal(callStep.stack.length, 2)
    const outer = callStep.stack[0].locals.arr as { ref: string }
    const inner = callStep.stack[1].locals.arr as { ref: string }
    assert.equal(outer.ref, inner.ref)
    assert.equal(Object.keys(callStep.heap).length, 1)
  })
})
