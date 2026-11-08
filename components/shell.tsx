import Link from 'next/link'
import type { ReactNode } from 'react'
import { DatabaseBackup } from 'lucide-react'
import { Nav } from './nav'
import { NextRun } from './next-run'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 rounded-md font-serif text-2xl focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <DatabaseBackup className="size-4.5" aria-hidden />
            </span>
            gitbackup
          </Link>
          <NextRun />
          <Nav />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pt-10 pb-24 sm:px-6 sm:pt-14">{children}</main>
    </>
  )
}
