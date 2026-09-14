import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'DSA Visualizer',
  description: 'Step through recorded Python execution traces.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
