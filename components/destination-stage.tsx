'use client'

import { useState } from 'react'
import { Cloud, HardDrive, Server } from 'lucide-react'
import { destinationCopy, exampleRun, reportText, type DestinationKind } from '@/lib/example'
import { cn } from '@/lib/utils'

const kinds: { kind: DestinationKind, icon: typeof Cloud }[] = [
  { kind: 's3', icon: Server },
  { kind: 'r2', icon: Cloud },
  { kind: 'drive', icon: HardDrive },
]

export function DestinationStage() {
  const [destination, setDestination] = useState<DestinationKind>('s3')
  const copy = destinationCopy(destination)
  return (
    <div className="mt-6">
      <div className="relative hidden h-40 overflow-hidden rounded-2xl border bg-muted/50 sm:block" aria-hidden>
        {['repository', 'branches and tags', 'notes'].map((chip, index) => (
          <span
            key={chip}
            className="absolute left-4 rounded-full border bg-card px-3 py-1 text-sm shadow-sm animate-travel"
            style={{ top: `${20 + index * 40}px`, animationDelay: `${index * 0.35}s` }}
          >
            {chip}
          </span>
        ))}
        <div key={destination} className="absolute inset-y-4 right-4 flex w-56 flex-col justify-center gap-1 rounded-xl bg-primary p-5 text-primary-foreground shadow-soft animate-in fade-in slide-in-from-bottom-2">
          <strong className="font-serif text-2xl font-normal">{copy.name}</strong>
          <span className="text-sm opacity-90">{copy.detail}</span>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Destination">
        {kinds.map(({ kind, icon: Icon }) => {
          const item = destinationCopy(kind)
          const checked = kind === destination
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => setDestination(kind)}
              className={cn(
                'flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                checked ? 'border-primary bg-accent shadow-soft ring-1 ring-primary' : 'hover:-translate-y-0.5 hover:shadow-soft',
              )}
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', checked ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
              <span>
                <strong className="block font-semibold">{item.name}</strong>
                <span className="text-sm text-muted-foreground">{item.detail}</span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="mt-4 text-muted-foreground">Set <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">GITBACKUP_TO={destination}</code> in <code>.env</code>. A finished run prints your own counts like this. Run it again with no new commits and the last line is <code>unchanged</code>.</p>
      <pre key={`report-${destination}`} className="mt-3 rounded-lg border border-code-border bg-code p-4 font-mono text-sm text-code-foreground animate-in fade-in">{reportText(exampleRun(destination))}</pre>
    </div>
  )
}
