import type { Trace } from '../trace/types.ts'

export type RunRequest = {
  type: 'run'
  source: string
}

export type ProgressPhase = 'boot' | 'runtime' | 'tracer' | 'running'

export type ProgressResponse = {
  type: 'progress'
  phase: ProgressPhase
  message: string
}

export type TraceResponse = {
  type: 'trace'
  trace: Trace
  /** Wall-clock milliseconds spent tracing, excluding runtime boot. */
  elapsedMs: number
}

export type ErrorResponse = {
  type: 'error'
  message: string
  /** Python traceback or other detail, when there is one. */
  detail?: string
}

export type WorkerRequest = RunRequest
export type WorkerResponse = ProgressResponse | TraceResponse | ErrorResponse

export const PROGRESS_LABELS: Record<ProgressPhase, string> = {
  boot: 'Starting worker',
  runtime: 'Loading Python runtime',
  tracer: 'Installing tracer',
  running: 'Tracing execution',
}
