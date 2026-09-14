"""Snapshot serialization: Python values -> the Val / HeapObj shapes in SPEC.md.

Heap objects are keyed by id() and referenced, never inlined, so `b = a`
yields two names pointing at one heap entry.
"""

import math
from collections import deque

from .limits import MAX_DEPTH, MAX_ITEMS


def _prim(value):
    """
    JSON has no inf or nan, and both encoders run with allow_nan=False, so a
    float like math.inf would abort the whole trace rather than spoil one
    cell. Carry it across as the text Python itself prints — 'inf', '-inf',
    'nan' — which is also what a reader expects to see in the value.

    The cost is that a string literally spelled "inf" is indistinguishable
    from the float once serialized. That is a tolerable trade for keeping the
    Val shape SPEC.md defines: {'v': number | string | boolean | null}.
    """
    if isinstance(value, float) and not math.isfinite(value):
        return repr(value)
    return value


def serialize_value(value, heap, depth=0):
    """Return a Val ({'v': prim} or {'ref': id}), filling `heap` as a side effect."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return {"v": _prim(value)}

    obj_id = str(id(value))

    if obj_id in heap:
        return {"ref": obj_id}

    if depth > MAX_DEPTH:
        heap[obj_id] = {"kind": "elided", "reason": "depth"}
        return {"ref": obj_id}

    # The placeholder must land in `heap` BEFORE recursing into children.
    # A cyclic structure re-enters serialize_value for this same object while
    # it is still being built; the `obj_id in heap` check above is what stops
    # that recursion, and it can only fire if this line already ran.
    heap[obj_id] = {"kind": "elided", "reason": "depth"}
    heap[obj_id] = _build(value, heap, depth)
    return {"ref": obj_id}


def _build(value, heap, depth):
    if isinstance(value, list):
        return _items(value, heap, depth, "list")
    if isinstance(value, tuple):
        return _items(value, heap, depth, "tuple")
    if isinstance(value, (set, frozenset)):
        return _items(value, heap, depth, "set")
    if isinstance(value, deque):
        return _items(value, heap, depth, "deque")
    if isinstance(value, dict):
        if len(value) > MAX_ITEMS:
            return {"kind": "elided", "reason": "size"}
        return {
            "kind": "dict",
            "entries": [
                [
                    serialize_value(k, heap, depth + 1),
                    serialize_value(v, heap, depth + 1),
                ]
                for k, v in value.items()
            ],
        }
    return _obj(value, heap, depth)


def _items(value, heap, depth, kind):
    if len(value) > MAX_ITEMS:
        return {"kind": "elided", "reason": "size"}
    return {
        "kind": kind,
        "items": [serialize_value(v, heap, depth + 1) for v in value],
    }


def _obj(value, heap, depth):
    fields = getattr(value, "__dict__", None)
    if fields is None:
        return {"kind": "obj", "cls": type(value).__name__, "fields": {}}
    if len(fields) > MAX_ITEMS:
        return {"kind": "elided", "reason": "size"}
    return {
        "kind": "obj",
        "cls": type(value).__name__,
        "fields": {
            name: serialize_value(v, heap, depth + 1) for name, v in fields.items()
        },
    }
