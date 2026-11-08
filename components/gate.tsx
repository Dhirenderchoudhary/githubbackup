import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import { Laptop } from 'lucide-react'
import { beats, type BeatId } from '@/lib/flow'
import { isLocalHost } from '@/lib/local-request'
import { Commands } from './commands'
import { PageHeader } from './page-header'
import { BeatPicture, WindowBar } from './walkthrough'

export async function Gate({ id, children }: { id: BeatId, children: ReactNode }) {
  const host = (await headers()).get('host') ?? ''
  if (isLocalHost(host)) return children
  const beat = beats.find((item) => item.id === id) ?? beats[0]
  return (
    <>
      <PageHeader step={beat.n} title={beat.label}>{beat.body}</PageHeader>
      <div className="mt-8 flex items-start gap-3 rounded-xl border border-primary/30 bg-accent p-4 text-accent-foreground">
        <Laptop className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>This screen works on your own computer. Clone the repository and start the app, then open this page there. Your token and keys never reach this website.</p>
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl border bg-card shadow-soft">
        <WindowBar label={beat.label} />
        <div className="p-5"><BeatPicture id={id} play={false} /></div>
      </div>
      <section className="mt-16">
        <h2 className="text-3xl">Run it on your computer</h2>
        <Commands />
      </section>
    </>
  )
}
