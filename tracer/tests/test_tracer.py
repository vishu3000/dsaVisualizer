import sys
import textwrap

from tracer.limits import MAX_DEPTH, STEP_CAP, USER_FILENAME
from tracer.tracer import run_trace


def run(src):
    return run_trace(textwrap.dedent(src).lstrip("\n"))


def last_locals(trace):
    return trace["steps"][-1]["stack"][-1]["locals"]


def all_locals(trace):
    seen = {}
    for step in trace["steps"]:
        for frame in step["stack"]:
            seen.update(frame["locals"])
    return seen


def heap_kinds(heap):
    return [obj for obj in heap.values()]


# 1. `b = a` on a list -> two locals, SAME heap ref


def test_alias_shares_one_heap_entry():
    trace = run(
        """
        a = [1, 2, 3]
        b = a
        end = True
        """
    )
    locals_ = last_locals(trace)

    assert "ref" in locals_["a"]
    assert locals_["a"] == locals_["b"]

    ref = locals_["a"]["ref"]
    heap = trace["steps"][-1]["heap"]
    assert heap[ref]["kind"] == "list"
    assert heap[ref]["items"] == [{"v": 1}, {"v": 2}, {"v": 3}]

    # One heap entry, not two copies of the same list.
    list_entries = [o for o in heap.values() if o["kind"] == "list"]
    assert len(list_entries) == 1


def test_distinct_lists_get_distinct_refs():
    trace = run(
        """
        a = [1, 2]
        b = [1, 2]
        end = True
        """
    )
    locals_ = last_locals(trace)
    assert locals_["a"]["ref"] != locals_["b"]["ref"]


# 2. a cyclic doubly-linked list serializes and terminates


def test_cyclic_doubly_linked_list_terminates():
    trace = run(
        """
        class Node:
            def __init__(self, val):
                self.val = val
                self.next = None
                self.prev = None

        a = Node(1)
        b = Node(2)
        a.next = b
        b.prev = a
        b.next = a
        a.prev = b
        end = True
        """
    )
    assert "error" not in trace["meta"]

    locals_ = last_locals(trace)
    assert locals_["end"] == {"v": True}

    heap = trace["steps"][-1]["heap"]
    a_ref = locals_["a"]["ref"]
    b_ref = locals_["b"]["ref"]

    node_a = heap[a_ref]
    node_b = heap[b_ref]
    assert node_a["kind"] == "obj" and node_a["cls"] == "Node"
    assert node_a["fields"]["next"] == {"ref": b_ref}
    assert node_a["fields"]["prev"] == {"ref": b_ref}
    # The cycle closes by reference rather than by inlining a second copy.
    assert node_b["fields"]["next"] == {"ref": a_ref}
    assert node_b["fields"]["prev"] == {"ref": a_ref}
    assert len([o for o in heap.values() if o.get("cls") == "Node"]) == 2


# 3. a self-referencing dict terminates


def test_self_referencing_dict_terminates():
    trace = run(
        """
        d = {}
        d['self'] = d
        d['n'] = 1
        end = True
        """
    )
    assert "error" not in trace["meta"]

    locals_ = last_locals(trace)
    assert locals_["end"] == {"v": True}

    d_ref = locals_["d"]["ref"]
    heap = trace["steps"][-1]["heap"]
    entries = dict(
        (k["v"], v) for k, v in ((e[0], e[1]) for e in heap[d_ref]["entries"])
    )
    assert entries["self"] == {"ref": d_ref}
    assert entries["n"] == {"v": 1}


def test_self_referencing_list_terminates():
    trace = run(
        """
        xs = [1]
        xs.append(xs)
        end = True
        """
    )
    assert "error" not in trace["meta"]
    locals_ = last_locals(trace)
    xs_ref = locals_["xs"]["ref"]
    heap = trace["steps"][-1]["heap"]
    assert heap[xs_ref]["items"] == [{"v": 1}, {"ref": xs_ref}]


# 4. nesting past MAX_DEPTH yields {kind:'elided'}


def test_nesting_past_max_depth_is_elided():
    depth = MAX_DEPTH + 8
    trace = run(
        f"""
        root = []
        cur = root
        for _ in range({depth}):
            nxt = []
            cur.append(nxt)
            cur = nxt
        end = True
        """
    )
    assert "error" not in trace["meta"]

    heap = trace["steps"][-1]["heap"]
    root_ref = last_locals(trace)["root"]["ref"]

    # Walk down from root and confirm the chain terminates in an elided node.
    node = heap[root_ref]
    levels = 0
    while node["kind"] == "list" and node["items"]:
        node = heap[node["items"][0]["ref"]]
        levels += 1

    assert node == {"kind": "elided", "reason": "depth"}
    assert levels == MAX_DEPTH + 1

    assert any(
        o["kind"] == "elided" and o["reason"] == "depth" for o in heap.values()
    )


def test_shallow_nesting_is_not_elided():
    trace = run(
        """
        x = [[[[1]]]]
        end = True
        """
    )
    heap = trace["steps"][-1]["heap"]
    assert not any(o["kind"] == "elided" for o in heap.values())


# 5. a 200k-iteration loop hits the 50k cap, returns a PARTIAL trace


def test_step_cap_returns_partial_trace():
    trace = run(
        """
        total = 0
        for i in range(200000):
            total += i
        end = True
        """
    )

    assert trace["meta"]["truncated"] is True
    assert trace["meta"]["steps"] == STEP_CAP
    assert len(trace["steps"]) == STEP_CAP

    # Partial, not empty: the steps that did run are real and in order.
    assert trace["steps"][0]["event"] == "call"
    assert trace["steps"][0]["stack"][-1]["fn"] == "<module>"
    assert trace["steps"][-1]["stack"][-1]["locals"]["total"]["v"] > 0
    # The loop never finished, so the line after it never ran.
    assert "end" not in all_locals(trace)


def test_short_program_is_not_truncated():
    trace = run(
        """
        total = 0
        for i in range(3):
            total += i
        """
    )
    assert trace["meta"]["truncated"] is False
    assert trace["meta"]["steps"] == len(trace["steps"]) < STEP_CAP


# 6. a ZeroDivisionError mid-run returns meta.error AND every prior step


def test_zero_division_error_keeps_prior_steps():
    trace = run(
        """
        x = 10
        y = 0
        print("before")
        z = x / y
        print("after")
        """
    )

    error = trace["meta"]["error"]
    assert error["type"] == "ZeroDivisionError"
    assert "division by zero" in error["message"]
    assert error["line"] == 4
    assert "ZeroDivisionError" in error["traceback"]

    # Every line before the throw is present, in order, and none after it.
    line_events = [s["line"] for s in trace["steps"] if s["event"] == "line"]
    assert line_events == [1, 2, 3, 4]

    seen = all_locals(trace)
    assert seen["x"] == {"v": 10}
    assert seen["y"] == {"v": 0}
    assert "z" not in seen

    # State captured before the throw survives, stdout included.
    assert trace["steps"][-1]["stdout"] == "before\n"
    assert any(s["event"] == "exception" for s in trace["steps"])


def test_error_inside_function_records_call_stack():
    trace = run(
        """
        def inner(n):
            return n / 0

        def outer(n):
            return inner(n)

        outer(5)
        """
    )
    assert trace["meta"]["error"]["type"] == "ZeroDivisionError"
    assert trace["meta"]["error"]["line"] == 2

    deepest = max(trace["steps"], key=lambda s: len(s["stack"]))
    assert [f["fn"] for f in deepest["stack"]] == ["<module>", "outer", "inner"]


# 7. frames from imported modules do not appear in the trace


def test_imported_module_frames_are_dropped():
    src = textwrap.dedent(
        """
        import string
        out = string.capwords('hello world')
        end = True
        """
    ).lstrip("\n")

    # Control: a naive tracer does see frames from string.py, so the assertion
    # below is about our filtering, not about the call being frameless.
    foreign = set()

    def naive(frame, event, arg):
        name = frame.f_code.co_filename
        if name != USER_FILENAME and "tracer" not in name:
            foreign.add(frame.f_code.co_name)
        return naive

    compiled = compile(src, USER_FILENAME, "exec")
    previous = sys.gettrace()
    sys.settrace(naive)
    try:
        exec(compiled, {"__name__": "__main__"})
    finally:
        sys.settrace(previous)
    assert "capwords" in foreign

    trace = run_trace(src)
    assert "error" not in trace["meta"]

    fns = {f["fn"] for s in trace["steps"] for f in s["stack"]}
    assert fns == {"<module>"}
    assert not (fns & foreign)

    assert last_locals(trace)["out"] == {"v": "Hello World"}
    # The imported module itself is not dragged into the heap.
    assert "string" not in last_locals(trace)


def test_user_functions_still_appear():
    trace = run(
        """
        def helper(n):
            return n * 2

        val = helper(21)
        """
    )
    fns = {f["fn"] for s in trace["steps"] for f in s["stack"]}
    assert fns == {"<module>", "helper"}
    assert last_locals(trace)["val"] == {"v": 42}


# Supporting tracer requirements from SPEC.md


def test_non_whitelisted_import_is_rejected():
    trace = run(
        """
        import os
        os.getcwd()
        """
    )
    error = trace["meta"]["error"]
    assert error["type"] == "ImportError"
    assert "'os'" in error["message"]
    assert trace["steps"] == []


def test_viz_hints_are_parsed_into_meta():
    trace = run(
        """
        arr = [3, 1, 2]  # @viz heap arr
        adj = {}  # @viz graph adj
        """
    )
    assert trace["meta"]["viz"] == {"arr": "heap", "adj": "graph"}


def test_stdout_is_cumulative_per_step():
    trace = run(
        """
        print("a")
        print("b")
        """
    )
    outs = [s["stdout"] for s in trace["steps"]]
    assert outs[-1] == "a\nb\n"
    assert outs == sorted(outs, key=len)


def test_stack_is_innermost_last():
    trace = run(
        """
        def a():
            return b()

        def b():
            return 1

        a()
        """
    )
    deepest = max(trace["steps"], key=lambda s: len(s["stack"]))
    assert [f["fn"] for f in deepest["stack"]] == ["<module>", "a", "b"]
