import { existsSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CATEGORY_LABELS, PROBLEMS, PROBLEM_GROUPS, findProblem } from './problems.ts'

const ROOT = new URL('../../', import.meta.url)

/** Filenames the tracer CLI and the sync script both expect. */
const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,48}$/

describe('the sample catalogue', () => {
  it('lists every problem exactly once', () => {
    const slugs = PROBLEMS.map((problem) => problem.slug)
    assert.equal(new Set(slugs).size, slugs.length, 'a slug is listed twice')
  })

  it('uses legal filenames', () => {
    for (const problem of PROBLEMS) {
      assert.ok(SLUG_PATTERN.test(problem.slug), `${problem.slug} is not a legal filename`)
    }
  })

  it('has a recorded trace and a source file for every entry', () => {
    // The catalogue is hand-edited, so a typo here would otherwise only show up
    // as a 404 in the browser.
    for (const problem of PROBLEMS) {
      for (const path of [
        `fixtures/${problem.slug}.json`,
        `examples/${problem.slug}.py`,
        `web/public/fixtures/${problem.slug}.json`,
        `web/public/examples/${problem.slug}.py`,
      ]) {
        assert.ok(existsSync(new URL(path, ROOT)), `missing ${path}`)
      }
    }
  })

  it('gives every entry a title and a blurb', () => {
    for (const problem of PROBLEMS) {
      assert.notEqual(problem.title.trim(), '', `${problem.slug} has no title`)
      assert.notEqual(problem.blurb.trim(), '', `${problem.slug} has no blurb`)
    }
  })

  it('names each category once and leaves none empty', () => {
    assert.equal(new Set(CATEGORY_LABELS).size, CATEGORY_LABELS.length)
    for (const group of PROBLEM_GROUPS) {
      assert.ok(group.problems.length > 0, `${group.label} is empty`)
    }
  })

  it('finds a problem by slug and nothing by a made-up one', () => {
    assert.equal(findProblem(PROBLEMS[0].slug)?.title, PROBLEMS[0].title)
    assert.equal(findProblem('no_such_fixture'), undefined)
  })
})
