"""Delta encoding: consecutive snapshots -> RFC 6902 JSON-Patch ops.

A trace of N steps becomes one full snapshot (init), a keyframe every
KEYFRAME_INTERVAL steps, and N-1 patches where deltas[i] takes snapshot i to
snapshot i+1. Reconstruction walks back to the nearest keyframe and replays
forward, so no more than KEYFRAME_INTERVAL patches are ever applied.
"""

import copy

from .limits import KEYFRAME_INTERVAL

EMPTY_SNAPSHOT = {"line": 0, "event": "line", "stack": [], "heap": {}, "stdout": ""}


def escape(token):
    """Escape a JSON Pointer reference token (RFC 6901)."""
    return str(token).replace("~", "~0").replace("/", "~1")


def unescape(token):
    return token.replace("~1", "/").replace("~0", "~")


def parse_pointer(path):
    if path == "":
        return []
    return [unescape(token) for token in path.split("/")[1:]]


def diff(a, b, path=""):
    """Return JSON-Patch ops that turn `a` into `b`."""
    ops = []
    _diff(a, b, path, ops)
    return ops


def _diff(a, b, path, ops):
    if a == b:
        return

    if isinstance(a, dict) and isinstance(b, dict):
        _diff_dict(a, b, path, ops)
    elif isinstance(a, list) and isinstance(b, list):
        _diff_list(a, b, path, ops)
    else:
        ops.append({"op": "replace", "path": path, "value": b})


def _diff_dict(a, b, path, ops):
    for key in a:
        if key not in b:
            ops.append({"op": "remove", "path": f"{path}/{escape(key)}"})
    for key, value in b.items():
        child = f"{path}/{escape(key)}"
        if key not in a:
            ops.append({"op": "add", "path": child, "value": value})
        else:
            _diff(a[key], value, child, ops)


def _diff_list(a, b, path, ops):
    for i in range(min(len(a), len(b))):
        _diff(a[i], b[i], f"{path}/{i}", ops)

    for i in range(len(a), len(b)):
        ops.append({"op": "add", "path": f"{path}/-", "value": b[i]})

    # Descending, so each index is still valid when its remove is applied.
    for i in range(len(a) - 1, len(b) - 1, -1):
        ops.append({"op": "remove", "path": f"{path}/{i}"})


def apply_patch(doc, ops):
    """Apply ops to doc in place and return it."""
    for op in ops:
        tokens = parse_pointer(op["path"])
        if not tokens:
            raise ValueError("patching the document root is not supported")

        parent = doc
        for token in tokens[:-1]:
            parent = parent[int(token)] if isinstance(parent, list) else parent[token]

        last = tokens[-1]
        kind = op["op"]

        if kind == "remove":
            if isinstance(parent, list):
                del parent[int(last)]
            else:
                del parent[last]
            continue

        # Copy: the op belongs to the trace, the document must not alias it.
        value = copy.deepcopy(op["value"])
        if kind == "add":
            if not isinstance(parent, list):
                parent[last] = value
            elif last == "-":
                parent.append(value)
            else:
                parent.insert(int(last), value)
        elif kind == "replace":
            if isinstance(parent, list):
                parent[int(last)] = value
            else:
                parent[last] = value
        else:
            raise ValueError(f"unsupported op {kind!r}")

    return doc


def encode(raw, keyframe_interval=KEYFRAME_INTERVAL):
    """Turn {'meta', 'steps'} from run_trace into the delta-encoded Trace."""
    if keyframe_interval < 1:
        raise ValueError("keyframe_interval must be >= 1")

    steps = raw["steps"]
    meta = copy.deepcopy(raw["meta"])

    if not steps:
        return {
            "meta": meta,
            "init": copy.deepcopy(EMPTY_SNAPSHOT),
            "keyframes": {},
            "deltas": [],
        }

    deltas = [diff(steps[i], steps[i + 1]) for i in range(len(steps) - 1)]
    keyframes = {
        str(i): copy.deepcopy(steps[i])
        for i in range(keyframe_interval, len(steps), keyframe_interval)
    }

    return {
        "meta": meta,
        "init": copy.deepcopy(steps[0]),
        "keyframes": keyframes,
        "deltas": deltas,
    }


def reconstruct(trace, i):
    """Return snapshot `i`, rebuilt from the nearest keyframe at or before it."""
    total = trace["meta"]["steps"]
    if not 0 <= i < total:
        raise IndexError(f"step {i} out of range (0..{total - 1})")

    base_index = 0
    base = trace["init"]
    for key, snapshot in trace["keyframes"].items():
        k = int(key)
        if base_index < k <= i:
            base_index, base = k, snapshot

    snapshot = copy.deepcopy(base)
    for j in range(base_index, i):
        apply_patch(snapshot, trace["deltas"][j])
    return snapshot
