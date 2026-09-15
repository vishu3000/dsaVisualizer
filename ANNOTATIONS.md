# Render annotations

How to tell Pytrace which drawing you want. Every routing below is verified
against `planCanvas`, not inferred from reading the code.

## Two forms

Long form — names its variable outright:

```python
# @viz graph adj
adj = {}
```

Short form — applies to whatever the next statement binds:

```python
# graph
adj = {}
```

Trailing — applies to its own line:

```python
adj = {}  # graph
```

Note the short form must be *exactly* the kind and nothing else. `# graph —
adjacency` is prose, and draws nothing.

The short form is resolved through the AST, so it finds the target of a tuple
unpack, an annotated assignment or a `for`. Only an exact match counts —
`# the graph we built` is prose and is ignored. Where both forms name the same
variable the long form wins.

## Every kind

| Annotation | Draws | Needs | Automatic? |
|---|---|---|---|
| `list` | a row of cells with an index row | any sequence | yes, for `list` |
| `tuple` | same, as a tuple | any sequence | yes, for `tuple` |
| `set` | bucket chips | any sequence | yes, for `set` |
| `dict` | key → value rows | a `dict` | yes, for `dict` |
| `deque` | the queue drawing (an alias) | any sequence | yes, for `collections.deque` |
| `queue` | HEAD → TAIL track | any sequence | only for a `deque` |
| `stack` | vertical, TOP marked, base line | any sequence | **never** |
| `heap` | binary tree over `2i+1` / `2i+2` | any sequence | **never** |
| `graph` | elk layered diagram | a `dict` of lists | **never** |
| `tree` | d3 binary tree | an instance | yes, with `left` **and** `right` |
| `linkedlist` | chain with SVG edges | an instance | yes, with `next` |

Anything else with fields draws as an **object card** — its fields listed, with
any sequence among them drawn as cells. No annotation needed, and none exists
for it.

## What you have to annotate, and why

**`stack` and `queue` on a list.** Both are a Python `list`; nothing in a
snapshot separates them. Only you know which one you meant.

```python
# stack
pending = [0]
```

**`heap`.** A `heapq` heap is also just a list.

```python
import heapq

# heap
pq = []
heapq.heappush(pq, (1, "a"))
```

**`graph`.** A dict of lists is structurally identical to any other dict of
lists — `{"apple": ["red", "green"]}` is not a graph.

```python
from collections import defaultdict

# graph
adj = defaultdict(list)
adj[0].append(1)
```

Node labels come from the dict's keys and its lists' values. An edge recorded
in both directions is folded into one undirected line, drawn without arrowheads.

## What you don't have to annotate

**Trees and linked lists** are recognised from their fields:

| Role | Field names accepted |
|---|---|
| left child | `left`, `l` |
| right child | `right`, `r` |
| next node | `next`, `nxt` |
| node label | `key`, `val`, `value`, `data`, `item`, `name`, `id` |

Left **and** right makes a tree; `next` alone makes a chain. A node carrying
all three is a tree. Annotating them anyway is fine and documents intent.

```python
class Node:                  # no annotation needed
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None
```

## Annotating a wrapper class

A hint naming a sequence, placed on an **instance**, resolves to the collection
inside it:

```python
class Queue:
    def __init__(self, capacity):
        self.items = [None] * capacity
        self.front = 0
        self.size = 0


# queue
q = Queue(5)
```

It goes on `q`, not on `class Queue:` — a hint above a `class` or a `def` is
dropped rather than binding to the first assignment in the body, which would
be neither what you wrote nor easy to notice.

The fields searched, in order: `items`, `data`, `values`, `elements`,
`buffer`, `arr`, `list`, then any other field holding a container. The drawing
keeps the name you know the object by.

Without the annotation you get the object card, which shows the same data with
its bookkeeping around it — so this is a preference, not a requirement.

## Three things worth knowing

**A hint above a `class` or `def` does nothing.** Put it on the line above the
variable it describes. The long form works anywhere, since it names its target.

**A hint that does not fit degrades rather than breaks.** `# graph` on a list
draws a list, because a list is not a dict. It does not error and it does not
blank the block.

**A `graph`, `tree` or `linkedlist` hint that fits but has nothing to draw
makes the block vanish.** An empty adjacency dict, or a tree of one node,
returns no model and the object drops to the raw dump at the bottom of the
canvas rather than falling back to a simpler drawing.

## Changing your mind without editing the source

The kind chip on any sequence block is a picker — **auto / list / stack /
queue / heap**. It overrides the source's own hint, survives stepping and
re-running, and resets when you load another sample. Graph, tree, linked list,
dict and set have no picker: those are structural facts rather than choices.
