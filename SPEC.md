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
- Render hints are parsed out of source and returned in meta as an override
  map, in two forms:
  - `# @viz <kind> <varname>` names its variable outright.
  - a comment that is nothing but a kind — `# graph`, `#tree`, `# linkedlist` —
    applies to whatever the next statement binds, or to its own line when it
    trails code. Resolved through the AST, so it finds the target of a tuple
    unpack, an annotated assignment or a `for`. Only an exact match counts:
    "# the graph we built" is prose. The long form wins where both name a
    variable.

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

Routing comes from `@viz` first, then structure. A stack and a queue are both
`list`, so nothing in a snapshot separates them; each sequence block carries a
picker (list / stack / queue / heap) that writes `{name: kind}` into the store,
merged over `meta.viz`. An override is an `@viz` line the source does not have
to carry: it is keyed by local name, wins over the source's own hint, survives
stepping and re-running, and is cleared when another problem is loaded.

## Pointer inference (lib/infer.ts)
`meta.indexNames` is collected from the AST and keyed by container —
`{arr: [mid], table: [i, j]}` — from the `i` in `arr[i]`, `arr[i + 1]` and
`arr[lo:hi]`. A chained subscript is attributed to its base, which is what gives
`table` both i and j from `table[i][j]`.

For a visualized list, resolve that map through every name bound to it. If the
result is empty the program never indexes this list, and it gets no pointers and
no shading at all. Otherwise, each int local in the innermost frame with
`0 <= v < len(list)` whose name is in the resolved set renders a labeled arrow
beneath that cell, and if two of the names pair up (lo/hi, left/right, start/end,
i/j) the span between them is shaded. A recognized pair draws whether or not it
is itself subscripted, since `lo`/`hi` are often only compared and reassigned.

Keyed by container, not a flat set: a flat set puts the loop's `i` on every list
in scope at once, so iterating one of two arrays made both grow a pointer and
appear to advance together.

Value alone is not enough to identify a cursor either: `max_profit = 4` over a
six-element list is indistinguishable from an index into it, and `for x in xs`
binds elements that are usually valid indices into their own list.

A loop that walks a visualized list by value (`for job in jobs`, recorded in
`meta.iterNames`) still gets a cursor, placed at the cell holding its element.
Its label shows the name alone: the position was found by matching the value,
not read off the program, and a duplicate value resolves to the first match.

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

## Milestone table
#	Milestone	Est.
1	Tracer	2–3 d
2	Fixtures	1 d
3	Delta encoding	1 d
4	Player shell (fixtures only)	2–3 d
5	Pyodide worker	2 d
6	List + pointer inference	3–4 d
7	Call stack	2–3 d
8	Remaining renderers	~1 wk
9	Ship	2 d