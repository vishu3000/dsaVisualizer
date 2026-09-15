import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/brand.ts'

// Required by output: 'export' — the file is written once at build time
// rather than served by a running route handler.
export const dynamic = 'force-static'

/** Written to out/robots.txt at build time. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    // A Sitemap line needs an absolute URL, so it appears only once the
    // deployed origin is known.
    ...(SITE_URL ? { sitemap: `${SITE_URL}/sitemap.xml`, host: SITE_URL } : {}),
  }
}
