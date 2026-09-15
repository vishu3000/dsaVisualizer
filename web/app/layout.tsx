import type { Metadata } from 'next'
import { Geist, IBM_Plex_Mono } from 'next/font/google'

import { APP_NAME } from '@/lib/brand.ts'

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
  description: 'Write Python, watch it run — every step, every object.',
  applicationName: APP_NAME,
  // Proves ownership to Google Search Console. The token is public by design:
  // it only means something to Google paired with this domain.
  verification: { google: 'pQH2VBMFygWO9jNz_BqI7Fmk-OjZKryRJ3o5mnhB5uk' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
