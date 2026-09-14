import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { SLUG_PATTERN, catalogSource, traceJson, validateSlug } from './fixtureFiles.ts'
import { PROBLEM_GROUPS, withProblem, type Problem, type ProblemGroup } from './problems.ts'
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

describe('catalogue entry placement', () => {
  const groups: ProblemGroup[] = [
    { label: 'Searching', problems: [{ slug: 'binary_search', title: 'BS', blurb: 'x' }] },
    { label: 'Graphs', problems: [{ slug: 'bfs_graph', title: 'BFS', blurb: 'y' }] },
  ]
  const fresh: Problem = { slug: 'merge_sort', title: 'Merge sort', blurb: 'z' }

  it('appends to an existing category without touching the others', () => {
    const next = withProblem(groups, 'Graphs', fresh)

    assert.deepEqual(next.map((g) => g.label), ['Searching', 'Graphs'])
    assert.deepEqual(next[1].problems.map((p) => p.slug), ['bfs_graph', 'merge_sort'])
    assert.deepEqual(next[0], groups[0])
  })

  it('creates a new category at the end when the label is unknown', () => {
    const next = withProblem(groups, 'Sorting', fresh)

    assert.deepEqual(next.map((g) => g.label), ['Searching', 'Graphs', 'Sorting'])
    assert.deepEqual(next[2].problems, [fresh])
  })

  it('does not mutate the groups it was given', () => {
    const before = JSON.stringify(groups)
    withProblem(groups, 'Graphs', fresh)
    withProblem(groups, 'Sorting', fresh)
    assert.equal(JSON.stringify(groups), before)
  })

  it('round trips the committed catalogue byte for byte', () => {
    // What the modal writes must be exactly what is already on disk, or every
    // save would show up as a reformatting diff.
    const onDisk = readFileSync(new URL('catalog.ts', import.meta.url), 'utf8')
    assert.equal(catalogSource(PROBLEM_GROUPS), onDisk)
  })

  it('keeps the shipped catalogue in step with the fixtures on disk', () => {
    const slugs = PROBLEM_GROUPS.flatMap((group) => group.problems.map((p) => p.slug))
    assert.equal(new Set(slugs).size, slugs.length, 'a slug is listed twice')
    for (const slug of slugs) {
      assert.ok(SLUG_PATTERN.test(slug), `${slug} is not a legal filename`)
    }
  })
})
