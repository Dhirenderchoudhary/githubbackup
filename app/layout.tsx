import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
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
    images: [{ url: '/og.png', width: 1280, height: 800, alt: 'The gitbackup home page' }],
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
      </body>
    </html>
  )
}
