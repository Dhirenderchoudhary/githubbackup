'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { beats } from '@/lib/flow'
import { cn } from '@/lib/utils'

export function Nav() {
  const path = usePathname()
  return (
    <nav aria-label="Steps" className="-mx-1 flex w-full gap-0.5 overflow-x-auto px-1 sm:ml-auto sm:w-auto">
      {beats.map((beat) => {
        const current = path === beat.href
        return (
          <Link
            key={beat.href}
            href={beat.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full py-1.5 pr-2 pl-1 text-xs sm:gap-2 sm:pr-3 sm:pl-1.5 sm:text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              current ? 'bg-accent text-accent-foreground ring-1 ring-primary/40' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <span className={cn('grid size-[18px] place-items-center rounded-full text-[10px] font-semibold sm:size-5 sm:text-[11px]', current ? 'bg-primary text-primary-foreground' : 'bg-foreground/85 text-background')}>
              {beat.n}
            </span>
            {beat.label}
          </Link>
        )
      })}
    </nav>
  )
}
