import ast
import json
import pathlib

import pytest

from tracer.cli import main
from tracer.delta import reconstruct

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
    "stack_ops",
    "queue_ops",
]

# Comprehensions and generator expressions may or may not get their own frame
# depending on the CPython version; either way they are user code.
SYNTHETIC_FRAMES = {"<module>", "<listcomp>", "<dictcomp>", "<setcomp>", "<genexpr>", "<lambda>"}


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def snapshots(name):
    """Every step of a fixture, replayed out of its deltas."""
    trace = load(f"{name}.json")
    return [reconstruct(trace, i) for i in range(trace["meta"]["steps"])]


def user_frame_names(source):
    """Frames user code can legitimately produce: defs, plus class bodies."""
    tree = ast.parse(source)
    return {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    } | SYNTHETIC_FRAMES


def walk_heap_objs(steps):
    for step in steps:
        for obj in step["heap"].values():
            yield obj


def test_every_example_has_a_fixture():
    assert sorted(p.stem for p in EXAMPLES.glob("*.py")) == sorted(NAMES)
    assert sorted(p.stem for p in FIXTURES.glob("*.json")) == sorted(NAMES)


@pytest.mark.parametrize("name", NAMES)
def test_fixture_is_a_complete_clean_trace(name):
    trace = load(f"{name}.json")

    assert set(trace) == {"meta", "init", "keyframes", "deltas"}
    assert trace["meta"]["truncated"] is False
    assert "error" not in trace["meta"]
    assert trace["meta"]["steps"] == len(trace["deltas"]) + 1 > 0


@pytest.mark.parametrize("name", NAMES)
def test_fixture_steps_match_the_schema(name):
    for step in snapshots(name):
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
    allowed = user_frame_names((EXAMPLES / f"{name}.py").read_text(encoding="utf-8"))

    seen = {frame["fn"] for step in snapshots(name) for frame in step["stack"]}
    assert seen <= allowed, f"library frames leaked into {name}: {seen - allowed}"


def test_bfs_fixture_exercises_defaultdict_and_deque():
    steps = snapshots("bfs_graph")
    kinds = {obj["kind"] for obj in walk_heap_objs(steps)}

    assert {"dict", "deque", "set", "list", "tuple"} <= kinds
    assert load("bfs_graph.json")["meta"]["viz"] == {
        "adj": "graph",
        "queue": "deque",
        "visited": "set",
    }

    last = steps[-1]
    adj = last["heap"][last["stack"][-1]["locals"]["adj"]["ref"]]
    assert adj["kind"] == "dict"
    # Every adjacency value is a referenced list, not an inlined one.
    for _key, value in adj["entries"]:
        assert value["ref"] in last["heap"]


def test_heap_ops_fixture_is_a_flat_list():
    assert load("heap_ops.json")["meta"]["viz"] == {"h": "heap"}

    heap_states = []
    for step in snapshots("heap_ops"):
        locals_ = step["stack"][-1]["locals"]
        if "h" in locals_:
            obj = step["heap"][locals_["h"]["ref"]]
            heap_states.append([item["v"] for item in obj["items"]])

    assert [] in heap_states
    assert [1, 3, 2, 5, 9, 8] in heap_states, "heapq sift order is visible"


def test_node_fixtures_carry_class_names():
    for name in ("linked_list_reverse", "bst_insert"):
        classes = {obj.get("cls") for obj in walk_heap_objs(snapshots(name))}
        assert "Node" in classes


def test_linked_list_fixture_chains_by_reference():
    last = snapshots("linked_list_reverse")[-1]
    heap = last["heap"]

    values = []
    ref = last["stack"][-1]["locals"]["head"]["ref"]
    while ref is not None:
        node = heap[ref]
        values.append(node["fields"]["val"]["v"])
        nxt = node["fields"]["next"]
        ref = nxt.get("ref") if "ref" in nxt else None

    assert values == [5, 4, 3, 2, 1]


def test_backtracking_fixture_shows_path_growing_and_shrinking():
    depths = [len(step["stack"]) for step in snapshots("backtracking_subsets")]

    assert max(depths) >= 4, "nested backtrack frames are recorded"
    assert depths[-1] == 1, "the stack unwinds back to the module frame"


def test_fixtures_are_smaller_than_their_full_snapshots():
    """Delta encoding is doing its job.

    Per fixture the bar is only "smaller": a short trace over tiny, churning
    state (heap_ops) pays enough JSON-Patch path overhead to nearly cancel the
    saving. The aggregate is where the encoding has to earn its keep.
    """
    total_encoded = total_full = 0

    for name in NAMES:
        encoded = (FIXTURES / f"{name}.json").stat().st_size
        full = len(json.dumps(snapshots(name)))
        assert encoded < full, f"{name} got bigger"
        total_encoded += encoded
        total_full += full

    assert total_encoded < total_full / 3


def test_cli_writes_json_to_a_file(tmp_path):
    out = tmp_path / "out.json"
    assert main([str(EXAMPLES / "binary_search.py"), "-o", str(out)]) == 0

    trace = json.loads(out.read_text(encoding="utf-8"))
    assert trace["meta"]["steps"] == load("binary_search.json")["meta"]["steps"]
    assert set(trace) == {"meta", "init", "keyframes", "deltas"}


def test_cli_writes_trace_to_stdout(capsys):
    assert main([str(EXAMPLES / "two_pointer.py")]) == 0

    captured = capsys.readouterr()
    trace = json.loads(captured.out)
    assert trace["meta"]["steps"] > 0
    assert "steps" in captured.err  # status goes to stderr, not into the JSON


def test_cli_reports_a_missing_file(capsys):
    assert main(["examples/does_not_exist.py"]) == 2
    assert "cannot read" in capsys.readouterr().err
