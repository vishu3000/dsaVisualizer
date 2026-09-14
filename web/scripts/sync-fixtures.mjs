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

for (const name of names) {
  copyFileSync(join(root, 'fixtures', `${name}.json`), join(fixturesOut, `${name}.json`))
  copyFileSync(join(root, 'examples', `${name}.py`), join(examplesOut, `${name}.py`))
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

console.log(`sync-fixtures: ${names.length} traces + sources -> public/`)
