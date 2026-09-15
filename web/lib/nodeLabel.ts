// Sizing a diagram node around the text it has to hold.
//
// Node labels used to be summaries — `tuple[2]` — and every one fitted the same
// box. Now that they carry contents, `(3, 5)` and `12` need different widths,
// and a heap of long tuples should not force every node in the drawing wide.

/** Past this a label is cut: the node is a circle, not a table cell. */
export const MAX_LABEL = 14

/** .shape-label is 12px monospace; this is one character of it. */
const CHAR_W = 7.3

/** What is drawn inside the node, which may be less than the value is. */
export function shortLabel(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label
}

/**
 * Node width for a set of labels: wide enough for the longest one it will
 * actually draw, never narrower than `min`, never wider than the cut allows.
 */
export function nodeWidth(labels: string[], min: number, padding = 22): number {
  const longest = labels.reduce(
    (widest, label) => Math.max(widest, shortLabel(label).length),
    1,
  )
  return Math.max(min, Math.ceil(longest * CHAR_W) + padding)
}
