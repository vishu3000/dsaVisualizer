// Pyodide refuses to start in a classic web worker, and webpack emits classic
// workers for Next's client build regardless of `{ type: 'module' }`. So the
// worker is bundled separately, as a real ES module, and served from public/.
//
// The tracer's Python sources are bundled into this file, which is what keeps
// SPEC.md's "no network fetch for tracer.py" true.

import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const result = await build({
  entryPoints: [join(root, 'workers', 'pyodide.worker.ts')],
  outfile: join(root, 'public', 'workers', 'pyodide.worker.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  sourcemap: true,
  logLevel: 'warning',
  metafile: true,
})

const bytes = Object.values(result.metafile.outputs).reduce((total, out) => total + out.bytes, 0)
console.log(`build-worker: public/workers/pyodide.worker.js (${(bytes / 1024).toFixed(1)} KB)`)
