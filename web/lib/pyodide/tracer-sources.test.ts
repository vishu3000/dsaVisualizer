// The worker carries a compiled-in copy of /tracer/*.py. That copy is generated
// (scripts/inline-tracer.mjs) but committed, so it can silently fall behind the
// real Python. This test is the guard.

import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { TRACER_SOURCES } from './tracer-sources.generated.ts'

const TRACER_DIR = new URL('../../../tracer/', import.meta.url)

describe('inlined tracer sources', () => {
  it('covers the modules the worker imports', () => {
    assert.deepEqual(Object.keys(TRACER_SOURCES).sort(), [
      '__init__.py',
      'delta.py',
      'limits.py',
      'serialize.py',
      'tracer.py',
    ])
  })

  for (const name of ['__init__.py', 'limits.py', 'serialize.py', 'tracer.py', 'delta.py']) {
    it(`${name} matches /tracer/${name} on disk`, () => {
      const onDisk = readFileSync(new URL(name, TRACER_DIR), 'utf8')
      assert.equal(
        TRACER_SOURCES[name],
        onDisk,
        `${name} is stale — run: npm run --prefix web predev`,
      )
    })
  }

  it('carries no network fetch for its own sources', () => {
    for (const source of Object.values(TRACER_SOURCES)) {
      assert.ok(!/\bimport\s+(requests|urllib|http)\b/.test(source))
    }
  })
})
