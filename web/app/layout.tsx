import type { Metadata } from 'next'
import { Geist, IBM_Plex_Mono } from 'next/font/google'

import { APP_DESCRIPTION, APP_NAME, APP_SEO_TITLE, SITE_URL } from '@/lib/brand.ts'

import './globals.css'

const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ui',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
})

// No `title` here on purpose: page.tsx renders the <title> element so it can
// name the loaded problem, and a title in both places emits two of them —
// whichever lands first in <head> wins, which is not the one that tracks.
export const metadata: Metadata = {
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    'python visualizer',
    'python debugger online',
    'algorithm visualizer',
    'data structure visualizer',
    'step through python code',
    'python execution trace',
    'dsa visualizer',
    'binary search visualization',
    'call stack visualizer',
    'pyodide',
  ],
  category: 'technology',
  // Absolute URLs below resolve against this; without it Next warns and emits
  // relative Open Graph URLs, which crawlers ignore.
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL), alternates: { canonical: '/' } } : {}),
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: APP_SEO_TITLE,
    description: APP_DESCRIPTION,
    locale: 'en_US',
    ...(SITE_URL ? { url: SITE_URL } : {}),
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_SEO_TITLE,
    description: APP_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Let Google show a full-size preview rather than a thumbnail.
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  // Proves ownership to Google Search Console. The token is public by design:
  // it only means something to Google paired with this domain.
  verification: { google: 'pQH2VBMFygWO9jNz_BqI7Fmk-OjZKryRJ3o5mnhB5uk' },
}

/**
 * Structured data describing what this page is.
 *
 * WebApplication rather than SoftwareApplication: nothing is downloaded or
 * installed, it runs where it is opened. Claims are kept to what the page can
 * back up — no ratings, no author, no counts — since invented ones are what
 * gets structured data ignored.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: APP_NAME,
  alternateName: `${APP_NAME} Python visualizer`,
  description: APP_DESCRIPTION,
  applicationCategory: 'DeveloperApplication',
  applicationSubCategory: 'Educational',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript and WebAssembly',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Run Python in the browser with no install or backend',
    'Step forwards and backwards through a complete execution trace',
    'Visualise lists, dictionaries, sets, stacks, queues and deques',
    'Draw graphs, binary trees, heaps and linked lists',
    'Follow the call stack and recursion tree at every step',
    'Share a program by URL',
  ],
  softwareHelp: 'Pick a sample, or write Python and press Run.',
  ...(SITE_URL ? { url: SITE_URL } : {}),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${plexMono.variable}`}>
      <body>
        {children}
        <script
          type="application/ld+json"
          // The object is built above from constants, so there is no user text
          // in it to escape.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </body>
    </html>
  )
}
