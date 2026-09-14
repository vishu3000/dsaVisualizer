import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { SLUG_PATTERN, traceJson, validateSlug } from './fixtureFiles.ts'
import { reconstruct } from './trace/reconstruct.ts'
import type { Trace } from './trace/types.ts'

const FIXTURES = new URL('../../fixtures/', import.meta.url)

describe('validateSlug', () => {
  const taken = ['binary_search', 'bfs_graph']

  it('accepts a plain snake_case name', () => {
    assert.equal(validateSlug('merge_sort', taken), null)
    assert.equal(validateSlug('a1', taken), null)
  })

  for (const bad of ['', 'Merge Sort', 'merge-sort', '1merge', 'MERGE', 'x', 'a'.repeat(60)]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      assert.notEqual(validateSlug(bad, taken), null)
    })
  }

  it('rejects a name already on disk', () => {
    assert.match(validateSlug('binary_search', taken)!, /already exists/)
  })

  it('matches the filename charset the tracer and sync script expect', () => {
    for (const name of ['binary_search', 'bfs_graph', 'stack_ops', 'queue_ops']) {
      assert.ok(SLUG_PATTERN.test(name), `${name} should be a legal slug`)
    }
  })
})

describe('traceJson', () => {
  const trace: Trace = JSON.parse(
    readFileSync(new URL('binary_search.json', FIXTURES), 'utf8'),
  )

  it('writes the same compact shape the CLI writes', () => {
    const onDisk = readFileSync(new URL('binary_search.json', FIXTURES), 'utf8')
    assert.equal(traceJson(trace), onDisk)
  })

  it('round trips into something the player can replay', () => {
    const reparsed: Trace = JSON.parse(traceJson(trace))
    for (let i = 0; i < reparsed.meta.steps; i++) {
      assert.deepStrictEqual(reconstruct(reparsed, i), reconstruct(trace, i))
    }
  })
})
