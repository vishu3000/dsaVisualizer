// Pointer inference checked against the real binary_search and sliding_window
// traces, step by step, rather than hand-built frames.

import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  cellState,
  inferForList,
  innermostFrame,
  intLocals,
  mutatedIndices,
  namesForRef,
} from './infer.ts'
import { reconstruct } from './trace/reconstruct.ts'
import type { HeapObj, Snapshot, Trace } from './trace/types.ts'

const FIXTURES = new URL('../../fixtures/', import.meta.url)

function load(name: string): Trace {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8'))
}

function steps(name: string): Snapshot[] {
  const trace = load(name)
  return Array.from({ length: trace.meta.steps }, (_, i) => reconstruct(trace, i))
}

/** The list bound to `name` in the innermost frame, if there is one. */
function listFor(snapshot: Snapshot, name: string) {
  const frame = innermostFrame(snapshot)
  const val = frame?.locals[name]
  if (!val || !('ref' in val)) return null
  const obj = snapshot.heap[val.ref] as HeapObj
  return obj && 'items' in obj ? { ref: val.ref, obj } : null
}

describe('intLocals', () => {
  it('keeps integers and drops refs, strings and booleans', () => {
    const frame = {
      fn: 'f',
      line: 1,
      locals: {
        i: { v: 3 },
        name: { v: 'x' },
        flag: { v: true },
        ratio: { v: 1.5 },
        arr: { ref: '1' },
        nothing: { v: null },
      },
    }
    assert.deepEqual([...intLocals(frame as never)], [['i', 3]])
  })
})

describe('binary_search', () => {
  const snapshots = steps('binary_search')

  it('pairs lo/hi into a span and leaves mid as a lone pointer', () => {
    const withAll = snapshots.filter((step) => {
      const frame = innermostFrame(step)
      return frame && 'lo' in frame.locals && 'hi' in frame.locals && 'mid' in frame.locals
    })
    assert.ok(withAll.length > 0, 'expected steps with lo/hi/mid in scope')

    for (const step of withAll) {
      const list = listFor(step, 'arr')
      assert.ok(list)
      const inference = inferForList(innermostFrame(step), list.obj.items.length)

      assert.equal(inference.spans.length, 1)
      assert.deepEqual(inference.spans[0].names, ['lo', 'hi'])

      const mid = inference.pointers.find((p) => p.name === 'mid')
      assert.ok(mid, 'mid should be a pointer')
      assert.equal(mid.paired, false)
      assert.ok(inference.active.has(mid.index))

      for (const name of ['lo', 'hi']) {
        const hit = inference.pointers.find((p) => p.name === name)
        assert.ok(hit)
        assert.equal(hit.paired, true)
      }
    }
  })

  it('shades exactly the cells between lo and hi', () => {
    const step = snapshots.find((s) => {
      const frame = innermostFrame(s)
      return frame?.locals.lo && frame.locals.hi && frame.locals.mid
    })!
    const list = listFor(step, 'arr')!
    const frame = innermostFrame(step)!
    const inference = inferForList(frame, list.obj.items.length)

    const lo = (frame.locals.lo as { v: number }).v
    const hi = (frame.locals.hi as { v: number }).v
    const expected = new Set<number>()
    for (let i = Math.min(lo, hi); i <= Math.max(lo, hi); i++) expected.add(i)

    assert.deepEqual([...inference.inWindow].sort((a, b) => a - b), [...expected].sort((a, b) => a - b))
  })

  it('never points at an index outside the list', () => {
    for (const step of snapshots) {
      const list = listFor(step, 'arr')
      if (!list) continue
      const inference = inferForList(innermostFrame(step), list.obj.items.length)
      for (const pointer of inference.pointers) {
        assert.ok(pointer.index >= 0 && pointer.index < list.obj.items.length)
      }
    }
  })

  it('ignores target and guess, whose values are not indices here', () => {
    // arr holds 2..91 and has 10 slots, so every value they take is >= 10.
    for (const step of snapshots) {
      const list = listFor(step, 'arr')
      if (!list) continue
      const inference = inferForList(innermostFrame(step), list.obj.items.length)
      const names = inference.pointers.map((p) => p.name)
      assert.ok(!names.includes('target'))
      assert.ok(!names.includes('guess'))
    }
  })

  it('marks out-of-range cells dim once a span exists', () => {
    const step = snapshots.find((s) => {
      const frame = innermostFrame(s)
      return frame?.locals.lo && frame.locals.hi
    })!
    const list = listFor(step, 'arr')!
    const inference = inferForList(innermostFrame(step), list.obj.items.length)

    for (let i = 0; i < list.obj.items.length; i++) {
      const state = cellState(i, inference, new Set())
      if (inference.inWindow.has(i)) assert.notEqual(state, 'dim')
      else assert.equal(state, 'dim')
    }
  })

  it('mutates nothing: binary search only reads', () => {
    for (let i = 1; i < snapshots.length; i++) {
      const list = listFor(snapshots[i], 'arr')
      if (!list) continue
      const mutated = mutatedIndices(list.obj, snapshots[i - 1].heap[list.ref])
      assert.equal(mutated.size, 0)
    }
  })

  it('resolves the aliased name in both frames', () => {
    const call = snapshots.find((s) => s.event === 'call' && s.stack.length === 2)!
    const ref = (call.stack[1].locals.arr as { ref: string }).ref
    assert.deepEqual(namesForRef(call, ref), ['arr'])
  })
})

describe('sliding_window', () => {
  const snapshots = steps('sliding_window')

  it('pairs left/right into a span', () => {
    const withBoth = snapshots.filter((step) => {
      const frame = innermostFrame(step)
      return frame && 'left' in frame.locals && 'right' in frame.locals
    })
    assert.ok(withBoth.length > 0)

    let sawSpan = false
    for (const step of withBoth) {
      const list = listFor(step, 'chars')
      if (!list) continue
      const inference = inferForList(innermostFrame(step), list.obj.items.length)
      if (inference.spans.length === 0) continue

      sawSpan = true
      assert.deepEqual(inference.spans[0].names, ['left', 'right'])
      assert.ok(inference.spans[0].from <= inference.spans[0].to)
    }
    assert.ok(sawSpan, 'expected at least one left/right span')
  })

  it('grows the window as right advances', () => {
    const widths: number[] = []
    for (const step of snapshots) {
      const list = listFor(step, 'chars')
      if (!list) continue
      const inference = inferForList(innermostFrame(step), list.obj.items.length)
      if (inference.spans.length > 0) widths.push(inference.inWindow.size)
    }
    assert.ok(widths.length > 3)
    assert.ok(Math.max(...widths) > Math.min(...widths), 'window should change size')
  })

  it('draws a cell for every character', () => {
    const step = snapshots.find((s) => listFor(s, 'chars'))!
    const list = listFor(step, 'chars')!
    assert.equal(list.obj.items.length, 8)
    assert.deepEqual(
      list.obj.items.map((item) => (item as { v: string }).v),
      ['a', 'b', 'c', 'a', 'b', 'c', 'b', 'b'],
    )
  })
})

describe('mutatedIndices', () => {
  it('flags a changed slot and nothing else', () => {
    const before = { kind: 'list', items: [{ v: 1 }, { v: 2 }, { v: 3 }] } as HeapObj
    const after = { kind: 'list', items: [{ v: 1 }, { v: 9 }, { v: 3 }] } as HeapObj
    assert.deepEqual([...mutatedIndices(after, before)], [1])
  })

  it('flags an appended slot', () => {
    const before = { kind: 'list', items: [{ v: 1 }] } as HeapObj
    const after = { kind: 'list', items: [{ v: 1 }, { v: 2 }] } as HeapObj
    assert.deepEqual([...mutatedIndices(after, before)], [1])
  })

  it('flags nothing without a previous snapshot', () => {
    const after = { kind: 'list', items: [{ v: 1 }] } as HeapObj
    assert.equal(mutatedIndices(after, undefined).size, 0)
  })

  it('treats a changed ref as a mutation', () => {
    const before = { kind: 'list', items: [{ ref: 'a' }] } as HeapObj
    const after = { kind: 'list', items: [{ ref: 'b' }] } as HeapObj
    assert.deepEqual([...mutatedIndices(after, before)], [0])
  })
})

describe('cellState precedence', () => {
  const inference = {
    pointers: [],
    spans: [{ names: ['lo', 'hi'] as [string, string], from: 1, to: 3 }],
    inWindow: new Set([1, 2, 3]),
    active: new Set([2]),
  }

  it('puts just-mutated above active', () => {
    assert.equal(cellState(2, inference, new Set([2])), 'just-mutated')
  })

  it('puts active above in-window', () => {
    assert.equal(cellState(2, inference, new Set()), 'active')
  })

  it('uses in-window inside the span', () => {
    assert.equal(cellState(1, inference, new Set()), 'in-window')
  })

  it('dims outside the span', () => {
    assert.equal(cellState(0, inference, new Set()), 'dim')
  })

  it('stays default when no span is on screen', () => {
    const bare = { pointers: [], spans: [], inWindow: new Set<number>(), active: new Set<number>() }
    assert.equal(cellState(0, bare, new Set()), 'default')
  })
})
