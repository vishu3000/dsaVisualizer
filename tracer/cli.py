"""Command line front end.

    python -m tracer examples/binary_search.py > fixtures/binary_search.json

The trace goes to stdout; status and warnings go to stderr so redirecting
stdout yields a clean JSON file.
"""

import argparse
import json
import pathlib
import sys

from .delta import encode
from .tracer import run_trace


def build_parser():
    parser = argparse.ArgumentParser(
        prog="python -m tracer",
        description="Trace a Python file and emit its trace as JSON.",
    )
    parser.add_argument("source", help="Python file to trace")
    parser.add_argument(
        "-o",
        "--output",
        help="write JSON to this path instead of stdout",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=None,
        help="pretty-print with this indent (default: compact)",
    )
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)

    path = pathlib.Path(args.source)
    try:
        source = path.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"tracer: cannot read {args.source}: {exc}", file=sys.stderr)
        return 2

    trace = encode(run_trace(source))
    meta = trace["meta"]

    try:
        # allow_nan=False: Infinity/NaN are not valid JSON and would fail to
        # parse in the browser. Fail here instead of shipping a broken fixture.
        # Compact separators match what JSON.stringify produces in the browser,
        # so a fixture written from the app's modal is byte-identical to one
        # written here and re-generating never shows up as whitespace churn.
        payload = json.dumps(
            trace,
            indent=args.indent,
            allow_nan=False,
            separators=None if args.indent is not None else (",", ":"),
        )
    except ValueError as exc:
        print(f"tracer: {args.source} is not JSON-serializable: {exc}", file=sys.stderr)
        return 1

    if args.output:
        pathlib.Path(args.output).write_text(payload, encoding="utf-8")
    else:
        sys.stdout.write(payload)
        if args.indent is not None:
            sys.stdout.write("\n")

    print(
        f"tracer: {path.name} -> {meta['steps']} steps, "
        f"{len(trace['keyframes'])} keyframes, {len(payload) / 1024:.1f} KB",
        file=sys.stderr,
    )
    if meta["truncated"]:
        print("tracer: warning: step cap hit, trace is partial", file=sys.stderr)
    if "error" in meta:
        err = meta["error"]
        print(
            f"tracer: warning: {err['type']} on line {err['line']}: {err['message']}",
            file=sys.stderr,
        )
    return 0
