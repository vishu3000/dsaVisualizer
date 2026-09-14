"""Limits enforced while tracing. See SPEC.md, "Tracer requirements"."""

MAX_DEPTH = 12
MAX_ITEMS = 1000
STEP_CAP = 50_000

USER_FILENAME = "<user>"

IMPORT_WHITELIST = frozenset(
    {
        "collections",
        "heapq",
        "math",
        "bisect",
        "functools",
        "itertools",
        "typing",
        "string",
        "re",
    }
)


class StepLimit(Exception):
    """Raised from inside the trace function once STEP_CAP steps are recorded.

    Caught by run_trace, which then returns the partial trace rather than
    nothing at all.
    """
