import json
import pathlib

import pytest

from tracer.delta import apply_patch, diff, encode, reconstruct
from tracer.limits import KEYFRAME_INTERVAL
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
    "stack_ops",
    "queue_ops",
]


def raw_trace(name):
    return run_trace((EXAMPLES / f"{name}.py").read_text(encoding="utf-8"))


# The required round trip, over every example.


@pytest.mark.parametrize("name", NAMES)
def test_reconstruct_matches_every_full_snapshot(name):
    raw = raw_trace(name)
    full = raw["steps"]
    trace = encode(raw)

    assert len(trace["deltas"]) == len(full) - 1

    for i in range(len(trace["deltas"]) + 1):
        assert reconstruct(trace, i) == full[i], f"{name} diverges at step {i}"


@pytest.mark.parametrize("name", NAMES)
def test_committed_fixture_reconstructs_to_a_fresh_trace(name):
    """The shipped fixture, not just a freshly encoded one, replays exactly."""
    fixture = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    full = raw_trace(name)["steps"]

    assert fixture["meta"]["steps"] == len(full)
    assert len(fixture["deltas"]) == len(full) - 1

    for i in range(len(fixture["deltas"]) + 1):
        rebuilt = reconstruct(fixture, i)
        # Heap ids are id() values and differ per run, so compare structure.
        assert rebuilt["line"] == full[i]["line"]
        assert rebuilt["event"] == full[i]["event"]
        assert rebuilt["stdout"] == full[i]["stdout"]
        assert [f["fn"] for f in rebuilt["stack"]] == [f["fn"] for f in full[i]["stack"]]
        assert [sorted(f["locals"]) for f in rebuilt["stack"]] == [
            sorted(f["locals"]) for f in full[i]["stack"]
        ]


@pytest.mark.parametrize("name", NAMES)
def test_reconstruct_is_order_independent(name):
    """Scrubbing backwards and jumping around gives the same snapshots."""
    raw = raw_trace(name)
    trace = encode(raw)
    total = trace["meta"]["steps"]

    for i in reversed(range(total)):
        assert reconstruct(trace, i) == raw["steps"][i]

    for i in (0, total - 1, total // 2, 0, total - 1):
        assert reconstruct(trace, i) == raw["steps"][i]


@pytest.mark.parametrize("name", NAMES)
def test_reconstruct_does_not_mutate_the_trace(name):
    trace = encode(raw_trace(name))
    before = json.dumps(trace, sort_keys=True)

    for i in range(trace["meta"]["steps"]):
        snapshot = reconstruct(trace, i)
        snapshot["stack"].append({"fn": "tampered", "line": 0, "locals": {}})
        snapshot["heap"]["tampered"] = {"kind": "list", "items": []}

    assert json.dumps(trace, sort_keys=True) == before


# Keyframes


def long_trace(iterations=400):
    return run_trace(
        "total = 0\n"
        f"for i in range({iterations}):\n"
        "    total += i\n"
        "    total -= 1\n"
    )


def test_keyframes_land_on_the_interval():
    raw = long_trace()
    total = len(raw["steps"])
    assert total > 2 * KEYFRAME_INTERVAL, "need a trace long enough to keyframe"

    trace = encode(raw)
    expected = [
        str(i) for i in range(KEYFRAME_INTERVAL, total, KEYFRAME_INTERVAL)
    ]
    assert list(trace["keyframes"]) == expected
    assert "0" not in trace["keyframes"], "step 0 is init, not a keyframe"

    for key, snapshot in trace["keyframes"].items():
        assert snapshot == raw["steps"][int(key)]


def test_long_trace_round_trips_across_keyframes():
    raw = long_trace()
    trace = encode(raw)

    for i in range(trace["meta"]["steps"]):
        assert reconstruct(trace, i) == raw["steps"][i], f"diverges at step {i}"


@pytest.mark.parametrize("interval", [1, 2, 3, 7, 50])
def test_round_trip_holds_at_any_keyframe_interval(interval):
    raw = raw_trace("bst_insert")
    trace = encode(raw, keyframe_interval=interval)

    for i in range(trace["meta"]["steps"]):
        assert reconstruct(trace, i) == raw["steps"][i]


def test_reconstruct_starts_from_the_keyframe_not_the_start():
    """Corrupting deltas before a keyframe must not affect steps after it."""
    raw = raw_trace("bst_insert")
    trace = encode(raw, keyframe_interval=10)

    for j in range(10):
        trace["deltas"][j] = [{"op": "replace", "path": "/stdout", "value": "CORRUPT"}]

    # Step 9 is rebuilt from init through the poisoned deltas.
    assert reconstruct(trace, 9)["stdout"] == "CORRUPT"
    # Step 10 onwards starts at the keyframe and is untouched.
    for i in range(10, trace["meta"]["steps"]):
        assert reconstruct(trace, i) == raw["steps"][i]


def test_reconstruct_rejects_out_of_range_steps():
    trace = encode(raw_trace("two_pointer"))
    total = trace["meta"]["steps"]

    for bad in (-1, total, total + 100):
        with pytest.raises(IndexError):
            reconstruct(trace, bad)


# diff / apply units


@pytest.mark.parametrize(
    "before,after",
    [
        ({"a": 1}, {"a": 2}),
        ({"a": 1}, {"a": 1, "b": 2}),
        ({"a": 1, "b": 2}, {"a": 1}),
        ({"a": [1, 2, 3]}, {"a": [1, 9, 3]}),
        ({"a": [1, 2]}, {"a": [1, 2, 3, 4]}),
        ({"a": [1, 2, 3, 4]}, {"a": [1, 2]}),
        ({"a": [1, 2, 3]}, {"a": []}),
        ({"a": []}, {"a": [1]}),
        ({"a": {"b": {"c": 1}}}, {"a": {"b": {"c": 2}}}),
        ({"a": 1}, {"a": "1"}),
        ({"a": None}, {"a": False}),
        ({"a": {"b": 1}}, {"a": [1]}),
        ({"a": [[1], [2]]}, {"a": [[1], [2], [3]]}),
        ({"weird/key~1": 1}, {"weird/key~1": 2}),
        ({}, {"a": {"deep": [1, {"x": None}]}}),
    ],
)
def test_diff_then_apply_round_trips(before, after):
    ops = diff(before, after)
    assert apply_patch(json.loads(json.dumps(before)), ops) == after


def test_identical_documents_produce_no_ops():
    doc = {"a": [1, 2, {"b": "c"}], "d": None}
    assert diff(doc, json.loads(json.dumps(doc))) == []


def test_unchanged_subtrees_are_not_touched():
    before = {"heap": {"1": {"kind": "list", "items": [1, 2, 3]}}, "line": 1}
    after = {"heap": {"1": {"kind": "list", "items": [1, 2, 3]}}, "line": 2}

    assert diff(before, after) == [{"op": "replace", "path": "/line", "value": 2}]


def test_ops_are_valid_json_patch():
    raw = raw_trace("bfs_graph")
    trace = encode(raw)

    for ops in trace["deltas"]:
        for op in ops:
            assert op["op"] in {"add", "remove", "replace"}
            assert op["path"].startswith("/")
            assert ("value" in op) == (op["op"] in {"add", "replace"})


def test_apply_does_not_alias_patch_values():
    ops = [{"op": "add", "path": "/items", "value": [1, 2]}]
    doc = apply_patch({}, ops)
    doc["items"].append(3)

    assert ops[0]["value"] == [1, 2]


# Edge cases


def test_empty_trace_encodes_to_an_empty_snapshot():
    raw = run_trace("import os\n")
    assert raw["steps"] == []

    trace = encode(raw)
    assert trace["meta"]["error"]["type"] == "ImportError"
    assert trace["deltas"] == []
    assert trace["keyframes"] == {}
    assert trace["init"] == {
        "line": 0,
        "event": "line",
        "stack": [],
        "heap": {},
        "stdout": "",
    }

    with pytest.raises(IndexError):
        reconstruct(trace, 0)


def test_single_step_trace_has_no_deltas():
    raw = {"meta": {"steps": 1, "truncated": False, "viz": {}}, "steps": [
        {"line": 1, "event": "call", "stack": [], "heap": {}, "stdout": ""}
    ]}
    trace = encode(raw)

    assert trace["deltas"] == []
    assert reconstruct(trace, 0) == raw["steps"][0]


def test_encode_preserves_meta():
    raw = raw_trace("binary_search")
    trace = encode(raw)

    assert trace["meta"] == raw["meta"]
    assert trace["meta"]["viz"] == {"arr": "list"}


def test_encode_rejects_a_zero_interval():
    with pytest.raises(ValueError):
        encode(raw_trace("two_pointer"), keyframe_interval=0)


def test_encoding_is_smaller_than_full_snapshots():
    for name in NAMES:
        raw = raw_trace(name)
        full_size = len(json.dumps(raw))
        encoded_size = len(json.dumps(encode(raw)))
        assert encoded_size < full_size, f"{name} got bigger"
