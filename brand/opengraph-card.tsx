// NOT part of the build. This is the source that drew
// web/app/opengraph-image.png; see README.md for how to re-run it.
import { ImageResponse } from 'next/og'

import { APP_NAME, APP_TAGLINE } from '@/lib/brand.ts'

// Generated at build time and written into the export, so the card works on a
// static host with nothing running. force-static is what output: 'export'
// requires to render it once rather than serve it from a route handler.
export const dynamic = 'force-static'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `${APP_NAME} — ${APP_TAGLINE}`

/** The mark from app/icon.svg, at card scale. Literal hex: no stylesheet here. */
function Mark() {
  return (
    <svg width="132" height="132" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#141720" />
      <rect x="10" y="17" width="13" height="30" rx="4" fill="#2b2e38" />
      <rect x="26" y="12" width="13" height="40" rx="4" fill="#f472b6" />
      <rect x="42" y="17" width="13" height="30" rx="4" fill="#38bdf8" />
    </svg>
  )
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 96px',
          background: '#0d0e12',
          color: '#e6e8ef',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <Mark />
          <div style={{ fontSize: 104, fontWeight: 600, letterSpacing: -2 }}>{APP_NAME}</div>
        </div>

        <div style={{ marginTop: 34, fontSize: 46, color: '#a9adbb' }}>
          {`${APP_TAGLINE} — every step, every object.`}
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 44 }}>
          {['lists', 'dicts', 'stacks', 'queues', 'graphs', 'trees', 'call stack'].map((word) => (
            <div
              key={word}
              style={{
                fontSize: 27,
                color: '#7dd3fc',
                border: '1px solid #234456',
                borderRadius: 10,
                padding: '10px 20px',
              }}
            >
              {word}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  )
}
