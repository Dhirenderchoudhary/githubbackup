import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Shell } from '@/components/shell'
import './globals.css'

export const metadata: Metadata = {
  title: 'gitbackup',
  description: 'Open-source backup for the GitHub repositories you created. Every branch, tag, and note, saved to Amazon S3, Cloudflare R2, or Google Drive from your own computer.',
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
