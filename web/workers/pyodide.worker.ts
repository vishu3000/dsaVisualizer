// Pyodide runs here, off the main thread. The tracer's Python sources are
// compiled into this bundle (see lib/pyodide/tracer-sources.generated.ts) and
// written straight into Pyodide's filesystem — nothing is fetched for them.
//
// loadPyodide() is deliberately not called at startup: the runtime is ~15 MB,
// so it boots on the first run request and is then cached for every later one.

import { TRACER_SOURCES } from '../lib/pyodide/tracer-sources.generated.ts'
import { PROGRESS_LABELS, type WorkerRequest, type WorkerResponse } from '../lib/pyodide/messages.ts'

const ctx = self as unknown as {
  postMessage(message: WorkerResponse): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<WorkerRequest>) => void,
  ): void
}

const PACKAGE_ROOT = '/home/pyodide'

// Held in a variable, not a literal, so the bundler leaves it as a runtime
// import: Pyodide is served from public/ and resolved by the browser.
const PYODIDE_URL = '/pyodide/pyodide.mjs'

type Pyodide = {
  FS: {
    mkdirTree(path: string): void
    writeFile(path: string, data: string, options?: { encoding?: string }): void
  }
  runPython(code: string): unknown
}

type PyodideModule = {
  loadPyodide(options: { indexURL: string }): Promise<Pyodide>
}

// The entry point the worker calls per run. Kept out of the request path so the
// imports happen once, at install time.
const BOOTSTRAP = `
import json
import sys

if ${JSON.stringify(PACKAGE_ROOT)} not in sys.path:
    sys.path.insert(0, ${JSON.stringify(PACKAGE_ROOT)})

from tracer.tracer import run_trace
from tracer.delta import encode


def _trace_to_json(source):
    return json.dumps(encode(run_trace(source)), allow_nan=False)


_trace_to_json
`

type TraceFn = (source: string) => string

let runtime: Promise<TraceFn> | null = null

function report(message: WorkerResponse) {
  ctx.postMessage(message)
}

function progress(phase: keyof typeof PROGRESS_LABELS, message = PROGRESS_LABELS[phase]) {
  report({ type: 'progress', phase, message })
}

async function boot(): Promise<TraceFn> {
  progress('runtime')

  const pyodideModule: PyodideModule = await import(PYODIDE_URL)
  const pyodide = await pyodideModule.loadPyodide({ indexURL: '/pyodide/' })

  progress('tracer')

  pyodide.FS.mkdirTree(`${PACKAGE_ROOT}/tracer`)
  for (const [name, source] of Object.entries(TRACER_SOURCES)) {
    pyodide.FS.writeFile(`${PACKAGE_ROOT}/tracer/${name}`, source, { encoding: 'utf8' })
  }

  return pyodide.runPython(BOOTSTRAP) as TraceFn
}

async function run(source: string) {
  if (!runtime) {
    progress('boot')
    runtime = boot()
  }

  let traceToJson: TraceFn
  try {
    traceToJson = await runtime
  } catch (cause) {
    // A failed boot must not poison every later run.
    runtime = null
    report({
      type: 'error',
      message: 'Could not start the Python runtime.',
      detail: cause instanceof Error ? cause.message : String(cause),
    })
    return
  }

  progress('running')
  const started = Date.now()

  try {
    const trace = JSON.parse(traceToJson(source))
    const elapsedMs = Date.now() - started

    // A trace with no steps never reached user code: a rejected import or a
    // syntax error. There is nothing to scrub, so surface it as an error.
    if (trace.meta.steps === 0) {
      const error = trace.meta.error
      report({
        type: 'error',
        message: error ? `${error.type}: ${error.message}` : 'The program produced no steps.',
        detail: error?.line ? `line ${error.line}` : undefined,
      })
      return
    }

    report({ type: 'trace', trace, elapsedMs })
  } catch (cause) {
    report({
      type: 'error',
      message: 'Tracing failed.',
      detail: cause instanceof Error ? cause.message : String(cause),
    })
  }
}

ctx.addEventListener('message', (event) => {
  if (event.data?.type === 'run') void run(event.data.source)
})
