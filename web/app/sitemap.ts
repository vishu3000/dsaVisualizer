import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/brand.ts'

// Required by output: 'export' — the file is written once at build time
// rather than served by a running route handler.
export const dynamic = 'force-static'

/** Evaluated once, when the export is built. */
const BUILT_AT = new Date()

/**
 * Written to out/sitemap.xml at build time.
 *
 * One entry, because there is one page: the samples are URL fragments
 * (#p=binary_search), and a fragment is not a separate document to a crawler.
 * Listing them would be padding a sitemap with duplicates of the same URL.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!SITE_URL) return []
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: BUILT_AT,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}
