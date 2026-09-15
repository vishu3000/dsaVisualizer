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

from .limits import IMPORT_WHITELIST, STEP_CAP, USER_FILENAME, StepLimit
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
