import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Analytics } from '@vercel/analytics/next'
import { Shell } from '@/components/shell'
import './globals.css'

const description = 'Open-source backup for the GitHub repositories you created. Every branch, tag, and note, saved to Amazon S3, Cloudflare R2, or Google Drive from your own computer.'

export const metadata: Metadata = {
  metadataBase: new URL('https://githubbackup.dhirenderchoudhary.com'),
  title: 'gitbackup',
  description,
  openGraph: {
    title: 'gitbackup',
    description,
    url: '/',
    siteName: 'gitbackup',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'gitbackup backs up every GitHub repository to S3, R2, or Google Drive' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'gitbackup',
    description,
    images: ['/og.png'],
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f1ea' },
    { media: '(prefers-color-scheme: dark)', color: '#141210' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
        <Analytics />
      </body>
    </html>
  )
}
