// The product's identity, in one place.
//
// Its own module rather than constants in layout.tsx: page.tsx is a client
// component, and importing from the layout would drag it into the client graph,
// where Next refuses to allow its `metadata` export.

export const APP_NAME = 'Pytrace'

export const APP_TAGLINE = 'Write Python, watch it run'

export const APP_DESCRIPTION =
  'Run Python in the browser and step through every line: list cells, ' +
  'dictionaries, stacks, queues, graphs, trees and the call stack, rebuilt ' +
  'at each step from a real execution trace. No install, no backend.'

/**
 * The title a crawler indexes. The page is prerendered with nothing loaded, so
 * this is what lands in the exported HTML — "Pytrace" alone says too little
 * about what the page does to win a search result.
 */
export const APP_SEO_TITLE = `${APP_NAME} — ${APP_TAGLINE}`

/** What the tab says while `label` is loaded. */
export function documentTitle(label: string): string {
  return `${label} · ${APP_NAME}`
}

/**
 * Where the site is deployed, or null when nobody has said.
 *
 * Canonical links, Open Graph URLs and the sitemap all need an absolute
 * origin, and guessing one is worse than omitting it: a canonical pointing at
 * a domain that is not yours tells Google the real page is somewhere else.
 * So these are emitted only once NEXT_PUBLIC_SITE_URL is set at build time.
 */
export const SITE_URL: string | null = (() => {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!raw) return null
  try {
    // Normalised so "example.com/" and "https://example.com" agree.
    return new URL(raw.includes('://') ? raw : `https://${raw}`).origin
  } catch {
    return null
  }
})()
