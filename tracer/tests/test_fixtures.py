import ast
import json
import pathlib

import pytest

from tracer.cli import main
from tracer.tracer import run_trace

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / "examples"
FIXTURES = ROOT / "fixtures"

NAMES = [
    "binary_search",
    "two_pointer",
    "sliding_window",
    "bfs_graph",
    "dfs_recursive",
    "dp_table",
    "heap_ops",
    "linked_list_reverse",
    "bst_insert",
    "backtracking_subsets",
]

# Comprehensions and generator expressions may or may not get their own frame
# depending on the CPython version; either way they are user code.
SYNTHETIC_FRAMES = {"<module>", "<listcomp>", "<dictcomp>", "<setcomp>", "<genexpr>", "<lambda>"}


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def user_frame_names(source):
    """Frames user code can legitimately produce: defs, plus class bodies."""
    tree = ast.parse(source)
    return {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    } | SYNTHETIC_FRAMES


def walk_heap_objs(trace):
    for step in trace["steps"]:
        for obj in step["heap"].values():
            yield obj


def test_every_example_has_a_fixture():
    assert sorted(p.stem for p in EXAMPLES.glob("*.py")) == sorted(NAMES)
    assert sorted(p.stem for p in FIXTURES.glob("*.json")) == sorted(NAMES)


@pytest.mark.parametrize("name", NAMES)
def test_fixture_is_a_complete_clean_trace(name):
    trace = load(f"{name}.json")

    assert set(trace) == {"meta", "steps"}
    assert trace["meta"]["truncated"] is False
    assert "error" not in trace["meta"]
    assert trace["meta"]["steps"] == len(trace["steps"]) > 0


@pytest.mark.parametrize("name", NAMES)
def test_fixture_steps_match_the_schema(name):
    trace = load(f"{name}.json")

    for step in trace["steps"]:
        assert set(step) == {"line", "event", "stack", "heap", "stdout"}
        assert step["event"] in {"line", "call", "return", "exception"}
        assert isinstance(step["line"], int)
        assert isinstance(step["stdout"], str)
        assert step["stack"], "every step has at least the module frame"

        for frame in step["stack"]:
            assert set(frame) == {"fn", "line", "locals"}
            for val in frame["locals"].values():
                assert set(val) in ({"v"}, {"ref"})
                # Rule 3: heap values are referenced, never inlined.
                if "ref" in val:
                    assert val["ref"] in step["heap"]


@pytest.mark.parametrize("name", NAMES)
def test_fixture_has_no_library_frames(name):
    trace = load(f"{name}.json")
    allowed = user_frame_names((EXAMPLES / f"{name}.py").read_text(encoding="utf-8"))

    seen = {frame["fn"] for step in trace["steps"] for frame in step["stack"]}
    assert seen <= allowed, f"library frames leaked into {name}: {seen - allowed}"


@pytest.mark.parametrize("name", NAMES)
def test_fixture_matches_a_fresh_trace(name):
    """Fixtures are regenerable: re-tracing the example gives the same steps."""
    fresh = run_trace((EXAMPLES / f"{name}.py").read_text(encoding="utf-8"))
    fixture = load(f"{name}.json")

    assert fresh["meta"]["steps"] == fixture["meta"]["steps"]
    assert fresh["meta"]["viz"] == fixture["meta"]["viz"]
    assert [s["line"] for s in fresh["steps"]] == [s["line"] for s in fixture["steps"]]
    assert [s["event"] for s in fresh["steps"]] == [s["event"] for s in fixture["steps"]]
    assert fresh["steps"][-1]["stdout"] == fixture["steps"][-1]["stdout"]


def test_bfs_fixture_exercises_defaultdict_and_deque():
    trace = load("bfs_graph.json")
    kinds = {obj["kind"] for obj in walk_heap_objs(trace)}

    assert {"dict", "deque", "set", "list", "tuple"} <= kinds
    assert trace["meta"]["viz"] == {"adj": "graph", "queue": "deque", "visited": "set"}

    last = trace["steps"][-1]["stack"][-1]["locals"]
    adj = trace["steps"][-1]["heap"][last["adj"]["ref"]]
    assert adj["kind"] == "dict"
    # Every adjacency value is a referenced list, not an inlined one.
    for _key, value in adj["entries"]:
        assert value["ref"] in trace["steps"][-1]["heap"]


def test_heap_ops_fixture_is_a_flat_list():
    trace = load("heap_ops.json")
    assert trace["meta"]["viz"] == {"h": "heap"}

    heap_states = []
    for step in trace["steps"]:
        locals_ = step["stack"][-1]["locals"]
        if "h" in locals_:
            obj = step["heap"][locals_["h"]["ref"]]
            heap_states.append([item["v"] for item in obj["items"]])

    assert [] in heap_states
    assert [1, 3, 2, 5, 9, 8] in heap_states, "heapq sift order is visible"


def test_node_fixtures_carry_class_names():
    for name, cls in (("linked_list_reverse.json", "Node"), ("bst_insert.json", "Node")):
        trace = load(name)
        classes = {obj.get("cls") for obj in walk_heap_objs(trace)}
        assert cls in classes


def test_linked_list_fixture_chains_by_reference():
    trace = load("linked_list_reverse.json")
    last = trace["steps"][-1]
    heap = last["heap"]
    head_ref = last["stack"][-1]["locals"]["head"]["ref"]

    values = []
    ref = head_ref
    while ref is not None:
        node = heap[ref]
        values.append(node["fields"]["val"]["v"])
        nxt = node["fields"]["next"]
        ref = nxt.get("ref") if "ref" in nxt else None

    assert values == [5, 4, 3, 2, 1]


def test_backtracking_fixture_shows_path_growing_and_shrinking():
    trace = load("backtracking_subsets.json")
    depths = [len(step["stack"]) for step in trace["steps"]]
    assert max(depths) >= 4, "nested backtrack frames are recorded"
    assert depths[-1] == 1, "the stack unwinds back to the module frame"


def test_cli_writes_json_to_a_file(tmp_path):
    out = tmp_path / "out.json"
    assert main([str(EXAMPLES / "binary_search.py"), "-o", str(out)]) == 0

    trace = json.loads(out.read_text(encoding="utf-8"))
    assert trace["meta"]["steps"] == load("binary_search.json")["meta"]["steps"]


def test_cli_writes_trace_to_stdout(capsys):
    assert main([str(EXAMPLES / "two_pointer.py")]) == 0

    captured = capsys.readouterr()
    trace = json.loads(captured.out)
    assert trace["meta"]["steps"] > 0
    assert "steps" in captured.err  # status goes to stderr, not into the JSON


def test_cli_reports_a_missing_file(capsys):
    assert main(["examples/does_not_exist.py"]) == 2
    assert "cannot read" in capsys.readouterr().err
