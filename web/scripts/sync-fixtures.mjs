// Traces live in /fixtures and their source in /examples, both at the repo
// root; Next can only serve what is under public/. Copy both in before
// dev/build so the player can fetch them, and write an index for the picker.

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const publicDir = join(here, '..', 'public')

const fixturesOut = join(publicDir, 'fixtures')
const examplesOut = join(publicDir, 'examples')
mkdirSync(fixturesOut, { recursive: true })
mkdirSync(examplesOut, { recursive: true })

const names = readdirSync(join(root, 'fixtures'))
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))
  .sort()

const missing = []
for (const name of names) {
  copyFileSync(join(root, 'fixtures', `${name}.json`), join(fixturesOut, `${name}.json`))

  // A fixture written from the app's New-fixture modal always ships its source
  // too, but tolerate one without so a stray trace cannot break the build.
  const source = join(root, 'examples', `${name}.py`)
  if (existsSync(source)) copyFileSync(source, join(examplesOut, `${name}.py`))
  else missing.push(name)
}
if (missing.length > 0) {
  console.warn(`sync-fixtures: no examples/*.py for ${missing.join(', ')}`)
}

writeFileSync(join(publicDir, 'fixtures', 'index.json'), JSON.stringify(names, null, 2) + '\n')

// Monaco is loaded from public/ rather than a CDN: this app is a static export
// with no backend, so it should not need the network to render an editor.
const monacoOut = join(publicDir, 'monaco', 'vs')
if (!existsSync(monacoOut)) {
  cpSync(join(here, '..', 'node_modules', 'monaco-editor', 'min', 'vs'), monacoOut, {
    recursive: true,
  })
  console.log('sync-fixtures: copied monaco -> public/monaco/vs')
}

// Pyodide is served from public/ for the same reason as Monaco: a static export
// with no backend should not depend on a CDN being reachable. Only the core
// runtime is copied — none of the scientific packages.
const PYODIDE_FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
]

const pyodideOut = join(publicDir, 'pyodide')
if (!existsSync(join(pyodideOut, 'pyodide.asm.wasm'))) {
  mkdirSync(pyodideOut, { recursive: true })
  for (const file of PYODIDE_FILES) {
    copyFileSync(join(here, '..', 'node_modules', 'pyodide', file), join(pyodideOut, file))
  }
  console.log('sync-fixtures: copied pyodide core -> public/pyodide')
}

console.log(`sync-fixtures: ${names.length} traces + sources -> public/`)
