# Brand

`pytrace-icon.svg` is the icon as supplied, C2PA content credentials intact.
It is the source of truth; nothing serves it directly.

`web/app/icon.svg` is the served copy: the same shapes with the provenance
block removed, 341 bytes against 8138. A favicon is fetched on every cold
load, and metadata no browser reads is not worth carrying there.

`web/app/apple-icon.png` is rendered from the same shapes for iOS home
screens, which do not take SVG.

Colors are the app's own tokens — `--bg-app` #0d0e12, `--cell-bd` #2b2e38,
`--exec` #f472b6, `--window` #38bdf8 — so the icon and the canvas cannot
drift apart.
