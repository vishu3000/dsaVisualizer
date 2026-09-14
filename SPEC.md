# Python DSA Execution Visualizer — Spec

## What this is
A static web app. User writes Python in a browser editor, hits Run, and the code
executes in Pyodide inside a Web Worker. Execution produces a complete TRACE up
front. The UI is a pure function of (trace, stepIndex) — it never watches code
run. This is what makes backward stepping and scrubbing possible.

Python only. No backend. No Docker. Static export.

## Hard architectural rules
1. The UI NEVER executes or observes code. It only reads a finished trace.
2. Renderers receive normalized trace objects. They never touch Pyodide.
3. Heap objects are keyed by `id()` and referenced, never inlined. `b = a` must
   produce two names pointing at ONE heap entry.
4. Snapshots are delta-encoded with keyframes. Never store N full snapshots.

## Trace schema (lib/trace/types.ts is the source of truth)
```ts
type Ref  = { ref: string }
type Prim = { v: number | string | boolean | null }
type Val  = Ref | Prim

type HeapObj =
  | { kind: 'list',   items: Val[] }
  | { kind: 'tuple',  items: Val[] }
  | { kind: 'set',    items: Val[] }
  | { kind: 'deque',  items: Val[] }
  | { kind: 'dict',   entries: [Val, Val][] }
  | { kind: 'obj',    cls: string, fields: Record<string, Val> }
  | { kind: 'elided', reason: 'depth' | 'size' }

type Frame = {
  fn: string
  line: number
  locals: Record<string, Val>
}

type Snapshot = {
  line: number
  event: 'line' | 'call' | 'return' | 'exception'
  stack: Frame[]              // innermost LAST
  heap: Record<string, HeapObj>
  stdout: string
}

type Trace = {
  meta: { steps: number; truncated: boolean; error?: PyError }
  init: Snapshot
  keyframes: Record<number, Snapshot>   // every 500 steps
  deltas: Delta[]                       // JSON-Patch ops, deltas[i] : i -> i+1
}

type PyError = { type: string; message: string; line: number; traceback: string }
```

## Repo layout
```
/tracer                  python package, runs under plain CPython
  tracer.py serialize.py limits.py delta.py cli.py tests/
/fixtures/*.json
/web
  app/ workers/ lib/trace/ lib/store.ts lib/infer.ts components/
```

## Tracer requirements (/tracer)
- Driven by `sys.settrace`. Handle line / call / return / exception.
- Ignore any frame where `frame.f_code.co_filename != "<user>"`. Pyodide
  internals and imported modules will otherwise flood the trace.
- serialize.py: recursive snapshot keyed on `id()`. CRITICAL: insert a
  placeholder into the heap dict BEFORE recursing into children, or cyclic
  structures (doubly linked lists, graphs with back edges) infinite-loop.
- MAX_DEPTH = 12, MAX_ITEMS = 1000 → emit `{kind:'elided'}`.
- Step cap 50_000. On exceeding, raise StepLimit, catch it, and return the
  PARTIAL trace with `meta.truncated = true`. Never return nothing.
- On user exception: capture PyError, set `meta.error`, and return the trace of
  everything that ran successfully before the throw.
- Import whitelist: collections, heapq, math, bisect, functools, itertools,
  typing, string, re. Reject others with a clear message.
- `# @viz <kind> <varname>` comments are parsed out of source and returned in
  meta as a render override map.

## Delta encoding
- delta.py computes JSON-Patch ops between consecutive snapshots.
- Keyframe every 500 steps.
- lib/trace/reconstruct.ts: `reconstruct(trace, i)` walks back to the nearest
  keyframe and applies forward. Must be correct for every i, both directions.

## Web app
- Next.js App Router, TypeScript, static export.
- Zustand store: `{ trace, currentStep, playing, speed, status }`. Everything
  else is derived. Do not put reconstructed snapshots in the store; derive them.
- Monaco via @monaco-editor/react. Current line via decorations.
- Pyodide runs in a Web Worker. tracer.py is inlined as a string constant — no
  network fetch for it. loadPyodide() is lazy (first Run, not page load) and the
  instance is cached across runs. Worker posts progress events during load.

## Renderers (components/render/)
Each takes `(obj: HeapObj, heap, ctx)` and returns JSX. No renderer knows about
Pyodide or the store.
- List: framer-motion `motion.div` per cell, `layout` prop, key = `${heapId}:${i}`.
- Dict/Set: bucket rows.  Deque: list with end caps.
- Heap: d3-hierarchy over 2i+1 / 2i+2 indices, rendered as a tree.
- LinkedList: walk `.next`, SVG edges.
- Tree: d3-hierarchy on `.left`/`.right`.
- Graph: elkjs layered, built from `dict[key] = list`.
- CallStack: frames innermost-first + recursion tree from call/return events.

## Pointer inference (lib/infer.ts)
For each int local in the innermost frame: if `0 <= v < len(list)` for a
visualized list, render a labeled arrow beneath that cell. If two such names
pair up (lo/hi, left/right, start/end, i/j), shade the span between them.

## Cell states (CSS variables, all renderers)
default, active, in-window, just-mutated, dimmed/out-of-range.

## Debug/transport features
step ±1, play/pause, speed, scrub to arbitrary index, jump-to-next-hit-of-line
(scan deltas for next `line === N`), jump-to-next-step-matching-predicate.

## Deps
next typescript zustand framer-motion @monaco-editor/react pyodide
d3-hierarchy elkjs lz-string fast-json-patch

## Out of scope — do not build
C++ or JS tracing. Any backend, API route, or database. Auth. Docker.
Server-side execution of any kind.