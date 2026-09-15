"""sys.settrace-driven execution tracer.

Runs user source compiled under the filename "<user>" and records one Snapshot
per traced event. Everything outside "<user>" (Pyodide internals, imported
modules) is dropped so it never reaches the trace.
"""

import ast
import contextlib
import io
import sys
import traceback
import types

from .limits import IMPORT_WHITELIST, STEP_CAP, USER_FILENAME, VIZ_KINDS, StepLimit
from .serialize import serialize_value

_SKIPPED_LOCAL_TYPES = (
    types.ModuleType,
    types.FunctionType,
    types.BuiltinFunctionType,
    types.MethodType,
    type,
)

_TRACED_EVENTS = ("call", "line", "return", "exception")


def parse_viz_hints(source):
    """Pull `# @viz <kind> <varname>` comments out of source.

    Returns {varname: kind}, the render override map carried in meta.
    """
    hints = {}
    for raw in source.splitlines():
        _, sep, comment = raw.partition("#")
        if not sep:
            continue
        parts = comment.strip().split()
        if len(parts) == 3 and parts[0] == "@viz":
            hints[parts[2]] = parts[1]
    return hints


def _bare_kind_lines(source):
    """Comments that are nothing but a renderer name, as {line: (kind, trailing)}.

    `trailing` marks a comment with code in front of it, which annotates the
    line it sits on rather than the one below.
    """
    found = {}
    for number, raw in enumerate(source.splitlines(), start=1):
        before, sep, comment = raw.partition("#")
        if not sep:
            continue
        # Only a comment that is exactly the kind. "# the graph we built" is
        # prose, and reading it as an instruction would be worse than useless.
        word = comment.strip().lower()
        if word in VIZ_KINDS:
            found[number] = (word, before.strip() != "")
    return found


def _bound_names(node):
    """Every name an assignment or loop target binds.

    Each target shape is handled by hand rather than walked: walking
    `self.items` finds `self` as well, and hinting the object because someone
    annotated one of its fields is not what the comment said.
    """
    if isinstance(node, ast.Name):
        return [node.id]
    # self.items = [...] declares `items` as far as a reader is concerned,
    # even though it never becomes a local of that name.
    if isinstance(node, ast.Attribute):
        return [node.attr]
    if isinstance(node, (ast.Tuple, ast.List)):
        return [name for element in node.elts for name in _bound_names(element)]
    if isinstance(node, ast.Starred):
        return _bound_names(node.value)
    return []


def parse_kind_comments(source, tree):
    """`# graph` on the line above a declaration, as {varname: kind}.

    The long form names its variable — `# @viz graph adj` — which is precise
    but means writing the name twice. A bare kind applies to whatever the next
    statement binds, so the comment sits where a reader would write it anyway.

    Resolved through the AST rather than by matching `name =` in the text, so
    it finds the target of a tuple unpack, an annotated assignment or a `for`,
    and is not fooled by an `=` inside a string.
    """
    wanted = _bare_kind_lines(source)
    if not wanted:
        return {}

    targets = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            names = [name for target in node.targets for name in _bound_names(target)]
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign, ast.For)):
            names = _bound_names(node.target)
        else:
            continue
        if names:
            targets.setdefault(node.lineno, []).extend(names)

    ordered = sorted(targets)
    hints = {}
    for line, (kind, trailing) in sorted(wanted.items()):
        # `adj = {}  # graph` means adj, not whatever comes next.
        at = line if trailing else next((after for after in ordered if after > line), None)
        if at is None or at not in targets:
            continue
        for name in targets[at]:
            hints.setdefault(name, kind)
    return hints


def _subscript_base(node):
    """The name being indexed: `table` for both `table[i]` and `table[i][j]`."""
    current = node
    while isinstance(current, ast.Subscript):
        current = current.value

    if isinstance(current, ast.Name):
        return current.id
    # self.grid[i] is indexing `grid`, whatever object holds it.
    if isinstance(current, ast.Attribute):
        return current.attr
    return None


def parse_index_names(tree):
    """Which names index which container: `{arr: [mid], table: [i, j]}`.

    Pointer inference would otherwise draw an arrow for any int local that
    happens to land inside a visualised list, which catches accumulators and
    loop values that have nothing to do with it — `max_profit = 4` over a
    six-element list of prices looks exactly like a cursor at cell 4.

    Keyed by container, not a flat set, because a flat set puts `i` on every
    list in scope at once: iterate over one of two arrays and both grow a
    pointer and appear to advance together. The source says which one `i`
    indexes, so that is what is recorded.

    The whole subscript expression is walked rather than only a bare Name, so
    `arr[mid + 1]` and `table[i - 1]` count, and slices contribute the lo and
    hi of `arr[lo:hi]`. A chained subscript is attributed to its base, which
    is what gives `table` both i and j from `table[i][j]`.
    """
    names = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Subscript):
            continue

        base = _subscript_base(node)
        if base is None:
            continue

        for inner in ast.walk(node.slice):
            if isinstance(inner, ast.Name):
                names.setdefault(base, set()).add(inner.id)

    return {base: sorted(found) for base, found in sorted(names.items())}


def parse_iter_names(tree):
    """Loop variables that walk a container by value: `for job in jobs`.

    Such a name is not an index — it holds the element — so the subscript rule
    in parse_index_names correctly refuses it, and the list would then be drawn
    with no cursor at all even though the loop is plainly walking it. Recording
    which container a loop variable came from lets the renderer mark the cell
    whose value it currently holds.

    Only a bare name or `reversed(name)` counts. `for x in adj[node]` and
    `for x in sorted(xs)` walk something built on the spot, not the container
    the reader is looking at. Tuple targets (`for a, b in edges`) are skipped:
    neither name holds an element of the drawn list.

    Returns {loop variable: container name}. Two loops reusing one variable
    over different containers keep the last, which is the one a reader is most
    likely to be looking at by then.
    """
    names = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.For) or not isinstance(node.target, ast.Name):
            continue

        source = node.iter
        if (
            isinstance(source, ast.Call)
            and isinstance(source.func, ast.Name)
            and source.func.id == "reversed"
            and len(source.args) == 1
        ):
            source = source.args[0]

        if isinstance(source, ast.Name):
            names[node.target.id] = source.id
    return names


def check_imports(source, tree):
    """Return a rejection message for the first non-whitelisted import, else None."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names = [alias.name for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            names = [node.module or ""]
        else:
            continue
        for name in names:
            root = name.split(".")[0]
            if root not in IMPORT_WHITELIST:
                allowed = ", ".join(sorted(IMPORT_WHITELIST))
                return (
                    node.lineno,
                    f"import of {root!r} is not allowed. Allowed modules: {allowed}.",
                )
    return None


def run_trace(source):
    """Execute `source` under sys.settrace and return the recorded trace.

    Always returns a trace: on step-limit overrun meta.truncated is True, and on
    a user exception meta.error is set, both alongside every step that ran.
    """
    steps = []
    stdout_buf = io.StringIO()
    truncated = False
    error = None
    viz = parse_viz_hints(source)

    try:
        tree = ast.parse(source, filename=USER_FILENAME)
    except SyntaxError as exc:
        return _result(
            steps,
            truncated,
            {
                "type": type(exc).__name__,
                "message": exc.msg,
                "line": exc.lineno or 0,
                "traceback": traceback.format_exc(),
            },
            viz,
        )

    # Long form wins: it names its variable outright, so it is the more
    # deliberate of the two.
    viz = {**parse_kind_comments(source, tree), **viz}

    index_names = parse_index_names(tree)
    iter_names = parse_iter_names(tree)

    rejected = check_imports(source, tree)
    if rejected is not None:
        line, message = rejected
        return _result(
            steps,
            truncated,
            {
                "type": "ImportError",
                "message": message,
                "line": line,
                "traceback": "",
            },
            viz,
            index_names,
            iter_names,
        )

    compiled = compile(tree, USER_FILENAME, "exec")
    step_count = 0

    def snapshot(frame, event):
        chain = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == USER_FILENAME:
                chain.append(f)
            f = f.f_back
        chain.reverse()  # innermost LAST

        heap = {}
        stack = []
        for user_frame in chain:
            locals_ = {}
            for name, value in user_frame.f_locals.items():
                if name.startswith("__"):
                    continue
                if isinstance(value, _SKIPPED_LOCAL_TYPES):
                    continue
                locals_[name] = serialize_value(value, heap, 0)
            stack.append(
                {
                    "fn": user_frame.f_code.co_name,
                    "line": user_frame.f_lineno,
                    "locals": locals_,
                }
            )

        return {
            "line": frame.f_lineno,
            "event": event,
            "stack": stack,
            "heap": heap,
            "stdout": stdout_buf.getvalue(),
        }

    def trace_func(frame, event, arg):
        nonlocal step_count
        if frame.f_code.co_filename != USER_FILENAME:
            return None
        if event in _TRACED_EVENTS:
            step_count += 1
            if step_count > STEP_CAP:
                raise StepLimit()
            steps.append(snapshot(frame, event))
        return trace_func

    user_globals = {"__name__": "__main__", "__builtins__": __builtins__}

    previous = sys.gettrace()
    sys.settrace(trace_func)
    try:
        with contextlib.redirect_stdout(stdout_buf):
            exec(compiled, user_globals)
    except StepLimit:
        truncated = True
    except BaseException as exc:  # noqa: BLE001 - user code may raise anything
        error = _py_error(exc)
    finally:
        sys.settrace(previous)

    return _result(steps, truncated, error, viz, index_names, iter_names)


def _py_error(exc):
    line = 0
    tb = exc.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == USER_FILENAME:
            line = tb.tb_lineno
        tb = tb.tb_next
    return {
        "type": type(exc).__name__,
        "message": str(exc),
        "line": line,
        "traceback": traceback.format_exc(),
    }


def _result(steps, truncated, error, viz, index_names=None, iter_names=None):
    meta = {
        "steps": len(steps),
        "truncated": truncated,
        "viz": viz,
        "indexNames": dict(index_names or {}),
        "iterNames": dict(iter_names or {}),
    }
    if error is not None:
        meta["error"] = error
    return {"meta": meta, "steps": steps}
