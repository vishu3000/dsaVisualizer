import { readFileSync, readdirSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PROBLEM_GROUPS, PROBLEM_SLUGS, PROBLEMS, findProblem } from './problems.ts'
import { MAX_HASH_LENGTH, encodeProblem, encodeSource, parseHash } from './share.ts'

const ROOT = new URL('../../', import.meta.url)

describe('source round trip', () => {
  const samples = [
    'x = 1\n',
    'def f(a, b):\n    return a + b\n\nprint(f(1, 2))\n',
    '# unicode: λ ∑ 日本語\ns = "héllo"\n',
    'x = "quotes \'single\' and \\"double\\""\n',
    'a = [1,2,3]\n'.repeat(200),
    '',
  ]

  for (const source of samples) {
    it(`survives compression (${source.length} chars)`, () => {
      if (source === '') {
        // Empty source compresses to something that decodes as empty, which we
        // treat as "no share target" rather than "share an empty file".
        assert.equal(parseHash(encodeSource(source)), null)
        return
      }
      const parsed = parseHash(encodeSource(source))
      assert.deepEqual(parsed, { kind: 'source', source })
    })
  }

  it('compresses repetitive python well below the hash cap', () => {
    const source = 'for i in range(10):\n    total += i\n'.repeat(100)
    const hash = encodeSource(source)
    assert.ok(hash.length < MAX_HASH_LENGTH, `hash was ${hash.length}`)
    assert.ok(hash.length < source.length / 4, 'expected real compression')
  })

  it('produces a hash safe to put in a URL', () => {
    const hash = encodeSource('print("a b&c=d#e?f")\n')
    assert.ok(hash.startsWith('#c='))
    assert.equal(hash, new URL(`https://example.com/${hash}`).hash)
  })
})

describe('problem links', () => {
  it('round trips a slug', () => {
    assert.deepEqual(parseHash(encodeProblem('binary_search')), {
      kind: 'problem',
      slug: 'binary_search',
    })
  })

  it('round trips every seeded problem', () => {
    for (const slug of PROBLEM_SLUGS) {
      assert.deepEqual(parseHash(encodeProblem(slug)), { kind: 'problem', slug })
    }
  })
})

describe('parseHash rejects junk', () => {
  for (const hash of ['', '#', '#nonsense', '#p=', '#c=', '#x=1', '#p=../etc/passwd', '#p=A B']) {
    it(`returns null for ${JSON.stringify(hash)}`, () => {
      assert.equal(parseHash(hash), null)
    })
  }

  it('returns null for undecodable payloads', () => {
    assert.equal(parseHash('#c=@@@not-lz-string@@@'), null)
  })

  it('never returns a trace', () => {
    const parsed = parseHash(encodeSource('x = 1\n'))
    assert.ok(parsed && parsed.kind === 'source')
    assert.ok(!('trace' in parsed), 'traces must be re-executed, never carried')
  })
})

describe('seeded problem list', () => {
  it('matches the fixtures on disk', () => {
    const fixtures = readdirSync(new URL('fixtures/', ROOT))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace(/\.json$/, ''))
      .sort()

    assert.deepEqual([...PROBLEM_SLUGS].sort(), fixtures)
  })

  it('has an example source for every problem', () => {
    for (const slug of PROBLEM_SLUGS) {
      const source = readFileSync(new URL(`examples/${slug}.py`, ROOT), 'utf8')
      assert.ok(source.length > 0)
    }
  })

  it('has no duplicate slugs and no empty copy', () => {
    assert.equal(new Set(PROBLEM_SLUGS).size, PROBLEM_SLUGS.length)
    for (const problem of PROBLEMS) {
      assert.ok(problem.title.trim().length > 0, `${problem.slug} needs a title`)
      assert.ok(problem.blurb.trim().length > 0, `${problem.slug} needs a blurb`)
    }
  })

  it('groups every problem exactly once', () => {
    const grouped = PROBLEM_GROUPS.flatMap((group) => group.problems.map((p) => p.slug))
    assert.deepEqual(grouped.sort(), [...PROBLEM_SLUGS].sort())
  })

  it('looks problems up by slug', () => {
    assert.equal(findProblem('bfs_graph')?.title, 'Breadth-first search')
    assert.equal(findProblem('nope'), undefined)
  })
})
