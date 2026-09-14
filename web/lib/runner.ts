import type { ProgressResponse, WorkerResponse } from './pyodide/messages.ts'
import type { Trace } from './trace/types.ts'

let worker: Worker | null = null

/**
 * The worker is created on first use, not at page load, so nothing about
 * Pyodide costs anything until someone actually hits Run. The instance — and
 * the Python runtime inside it — is reused for every later run.
 */
function getWorker(): Worker {
  if (!worker) {
    // Served from public/, built by scripts/build-worker.mjs from
    // workers/pyodide.worker.ts. It must be a genuine module worker: Pyodide
    // throws on classic workers, and webpack only emits classic ones here.
    worker = new Worker('/workers/pyodide.worker.js', { type: 'module' })
  }
  return worker
}

export type RunHandlers = {
  onProgress: (progress: ProgressResponse) => void
}

export class RunFailure extends Error {
  detail?: string

  constructor(message: string, detail?: string) {
    super(message)
    this.name = 'RunFailure'
    this.detail = detail
  }
}

export function runSource(source: string, { onProgress }: RunHandlers): Promise<Trace> {
  const active = getWorker()

  return new Promise<Trace>((resolve, reject) => {
    function cleanup() {
      active.removeEventListener('message', onMessage)
      active.removeEventListener('error', onError)
    }

    function onMessage(event: MessageEvent<WorkerResponse>) {
      const data = event.data
      if (data.type === 'progress') {
        onProgress(data)
        return
      }
      cleanup()
      if (data.type === 'trace') resolve(data.trace)
      else reject(new RunFailure(data.message, data.detail))
    }

    function onError(event: ErrorEvent) {
      cleanup()
      reject(new RunFailure('The worker crashed.', event.message))
    }

    active.addEventListener('message', onMessage)
    active.addEventListener('error', onError)
    active.postMessage({ type: 'run', source })
  })
}
