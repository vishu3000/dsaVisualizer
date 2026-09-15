"""Render the Pytrace mark to PNG for platforms that will not take SVG.

iOS home screens ignore an SVG favicon, so apple-icon.png has to exist as
pixels. Rather than commit an opaque binary nobody can regenerate, this draws
the same four shapes app/icon.svg draws, from the same numbers, using only the
standard library.

    python3 brand/render-icon.py

Supersamples 4x and averages down, which is what gives the rounded corners a
clean edge without an imaging library. iOS applies its own corner mask, so the
background here is a full square: rounding it too would show a dark rim inside
the mask.
"""

import struct
import zlib
from pathlib import Path

SIZE = 180
SUPER = 4

BACKGROUND = (0x0D, 0x0E, 0x12)
BARS = [
    # x, y, w, h, radius, colour — the viewBox is 64x64, as in icon.svg.
    (10, 17, 13, 30, 4, (0x2B, 0x2E, 0x38)),
    (26, 12, 13, 40, 4, (0xF4, 0x72, 0xB6)),
    (42, 17, 13, 30, 4, (0x38, 0xBD, 0xF8)),
]


def inside_rounded_rect(px, py, x, y, w, h, r):
    """True when (px, py) falls inside a rounded rectangle."""
    if px < x or px >= x + w or py < y or py >= y + h:
        return False

    # Only the four corner boxes need the distance test.
    cx = x + r if px < x + r else x + w - r if px > x + w - r else px
    cy = y + r if py < y + r else y + h - r if py > y + h - r else py
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def render():
    scale = SIZE * SUPER / 64.0
    rows = []

    for py in range(SIZE):
        row = bytearray()
        for px in range(SIZE):
            totals = [0, 0, 0]

            for sy in range(SUPER):
                for sx in range(SUPER):
                    # Sample at the centre of each sub-pixel.
                    ux = (px * SUPER + sx + 0.5) / scale
                    uy = (py * SUPER + sy + 0.5) / scale

                    colour = BACKGROUND
                    for x, y, w, h, r, fill in BARS:
                        if inside_rounded_rect(ux, uy, x, y, w, h, r):
                            colour = fill
                            break

                    for i in range(3):
                        totals[i] += colour[i]

            samples = SUPER * SUPER
            row.extend(total // samples for total in totals)
        rows.append(bytes(row))

    return rows


def write_png(path, rows):
    def chunk(tag, payload):
        body = tag + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))

    # Filter byte 0 (None) in front of every scanline.
    raw = b"".join(b"\x00" + row for row in rows)
    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0)

    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


if __name__ == "__main__":
    out = Path(__file__).resolve().parents[1] / "web" / "app" / "apple-icon.png"
    write_png(out, render())
    print(f"render-icon: {SIZE}x{SIZE} -> {out.relative_to(Path.cwd())} ({out.stat().st_size} bytes)")
