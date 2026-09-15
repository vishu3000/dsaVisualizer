/**
 * The Pytrace mark: three bars, the middle one mid-step.
 *
 * Inline rather than an <img> so it costs no request and inherits the page's
 * own tokens — the fills are --cell-bd, --exec and --window, the same values
 * the canvas paints cells with, so the icon cannot drift from the app.
 * app/icon.svg is the same shapes with literal hex, since a favicon has no
 * stylesheet to read.
 */
export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="14" fill="var(--bg-app)" />
      <rect x="10" y="17" width="13" height="30" rx="4" fill="var(--cell-bd)" />
      <rect x="26" y="12" width="13" height="40" rx="4" fill="var(--exec)" />
      <rect x="42" y="17" width="13" height="30" rx="4" fill="var(--window)" />
    </svg>
  )
}
