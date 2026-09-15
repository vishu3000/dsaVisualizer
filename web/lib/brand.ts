// The product name, in one place.
//
// Its own module rather than a constant in layout.tsx: page.tsx is a client
// component, and importing from the layout would drag it into the client graph,
// where Next refuses to allow its `metadata` export.

export const APP_NAME = 'Pytrace'

/** What the tab says while `label` is loaded. */
export function documentTitle(label: string): string {
  return `${label} · ${APP_NAME}`
}
