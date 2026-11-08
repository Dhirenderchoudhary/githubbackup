'use client'

import { useEffect, useState } from 'react'
import { Check, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { beats, type BeatId } from '@/lib/flow'
import { cn } from '@/lib/utils'

const dwell = 5600

export function Walkthrough() {
  const [current, setCurrent] = useState<BeatId>('setup')
  const [cycle, setCycle] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reduce, setReduce] = useState(false)
  const beat = beats.find((item) => item.id === current) ?? beats[0]

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduce(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (reduce || paused) return
    const timer = window.setTimeout(() => {
      const index = beats.findIndex((item) => item.id === current)
      setCurrent(beats[(index + 1) % beats.length].id)
      setCycle((value) => value + 1)
    }, dwell)
    return () => window.clearTimeout(timer)
  }, [current, cycle, paused, reduce])

  function choose(id: BeatId) {
    setCurrent(id)
    setCycle((value) => value + 1)
  }

  return (
    <div
      className="mt-6 grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="grid content-start gap-2" role="tablist" aria-label="How a backup works">
        {beats.map((item) => {
          const selected = item.id === current
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => choose(item.id)}
              className={cn(
                'relative grid grid-cols-[2.25rem_1fr] items-start gap-3 overflow-hidden rounded-xl border p-3 text-left transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                selected ? 'border-primary/50 bg-accent shadow-soft' : 'bg-card hover:bg-muted',
              )}
            >
              <span className={cn('grid size-9 place-items-center rounded-full font-serif text-lg transition-colors', selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')}>{item.n}</span>
              <span>
                <strong className="block font-semibold">{item.title}</strong>
                <span className={cn('grid transition-all duration-300', selected ? 'mt-1 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                  <span className="overflow-hidden text-sm text-muted-foreground">{item.body}</span>
                </span>
              </span>
              {selected && !reduce ? <span key={cycle} className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary animate-fill" /> : null}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        <WindowBar label={beat.label} />
        <div className="p-5 animate-rise" key={`${current}-${reduce ? 'still' : cycle}`}>
          <BeatPicture id={current} play={!reduce} />
        </div>
      </div>
    </div>
  )
}

export function WindowBar({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 border-b bg-muted/60 px-4 py-2.5">
      <span className="flex gap-1.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
        <span className="size-2.5 rounded-full bg-foreground/15" />
      </span>
      <span className="font-serif text-lg">gitbackup</span>
      <span className="ml-auto text-sm text-muted-foreground">{label}</span>
    </div>
  )
}

export function BeatPicture({ id, play }: { id: BeatId, play: boolean }) {
  const [frame, setFrame] = useState(play ? 0 : 3)

  useEffect(() => {
    if (!play) {
      setFrame(3)
      return
    }
    setFrame(0)
    const timer = window.setInterval(() => setFrame((value) => Math.min(value + 1, 3)), 700)
    return () => window.clearInterval(timer)
  }, [id, play])

  return (
    <div className="grid min-h-72 content-start gap-3" aria-hidden>
      {id === 'setup' ? <SetupPicture frame={frame} /> : null}
      {id === 'repos' ? <ReposPicture frame={frame} /> : null}
      {id === 'backup' ? <BackupPicture frame={frame} /> : null}
      {id === 'schedule' ? <SchedulePicture frame={frame} /> : null}
    </div>
  )
}

const fakeInput = 'flex h-10 items-center rounded-md border bg-background px-3 font-mono text-sm tracking-widest'

function Reveal({ on, children, className }: { on: boolean, children: React.ReactNode, className?: string }) {
  return <div className={cn('transition-all duration-300', on ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0', className)}>{children}</div>
}

function SetupPicture({ frame }: { frame: number }) {
  const dots = '•'.repeat(frame === 0 ? 0 : frame === 1 ? 6 : 16)
  return (
    <>
      <p className="text-sm font-medium">GitHub token</p>
      <div className={fakeInput}>{dots}<span className="ml-0.5 h-4 w-px bg-foreground animate-blink" /></div>
      <Reveal on={frame >= 3} className="flex items-center gap-2 text-sm font-medium text-success">
        <CheckCircle2 className="size-4" /> Saved on this computer.
      </Reveal>
      <p className="text-sm text-muted-foreground">Leave the box empty and gitbackup reads GITHUB_TOKEN from .env.</p>
    </>
  )
}

function Pill({ on, children }: { on: boolean, children: React.ReactNode }) {
  return <span className={cn('rounded-full border px-3 py-1 text-sm transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{children}</span>
}

function ReposPicture({ frame }: { frame: number }) {
  const org = frame >= 2
  const rows = [
    { name: 'you/notes', group: 'Owned' },
    { name: 'you/site', group: 'Owned' },
    ...(org ? [{ name: 'org/billing', group: 'Organization' }] : []),
  ]
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Pill on>Owned</Pill>
        <Pill on={org}>Organization</Pill>
        <Pill on={false}>Starred</Pill>
        <Pill on={false}>Forked</Pill>
      </div>
      <div className="divide-y rounded-lg border bg-background px-3">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-3 py-2.5 animate-rise">
            <span className="grid size-4 place-items-center rounded-[4px] bg-primary text-primary-foreground"><Check className="size-3" /></span>
            <strong className="text-sm font-medium">{row.name}</strong>
            <span className="rounded-full border px-2 text-xs text-muted-foreground">{row.group}</span>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{rows.length} selected. Branches, tags, and notes are included.</p>
    </>
  )
}

function BackupPicture({ frame }: { frame: number }) {
  const stages = frame === 0 ? ['wait', 'wait'] : frame === 1 ? ['run', 'wait'] : frame === 2 ? ['done', 'run'] : ['done', 'done']
  const names = ['you/notes', 'you/site']
  const lines = [
    frame >= 1 ? 'you/notes cloning' : '',
    frame >= 2 ? 'you/notes saved' : '',
    frame >= 2 ? 'you/site cloning' : '',
    frame >= 3 ? 'you/site saved' : '',
    frame >= 3 ? 'published' : '',
  ].filter(Boolean)
  const done = stages.filter((stage) => stage === 'done').length
  return (
    <>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${done * 50}%` }} />
      </div>
      <div className="divide-y rounded-lg border bg-background px-3">
        {names.map((name, index) => (
          <div key={name} className="flex items-center gap-3 py-2.5 text-sm">
            {stages[index] === 'done' ? <CheckCircle2 className="size-4 text-success" /> : stages[index] === 'run' ? <Loader2 className="size-4 animate-spin text-warning" /> : <Clock className="size-4 text-muted-foreground" />}
            <span className="font-medium">{name}</span>
            <span className="ml-auto text-xs text-muted-foreground">{stages[index] === 'done' ? 'Saved' : stages[index] === 'run' ? 'Cloning' : 'Waiting'}</span>
          </div>
        ))}
      </div>
      <pre className="min-h-24 rounded-lg bg-code p-3 font-mono text-xs text-code-foreground">{lines.join('\n') || 'The log starts when the run starts.'}</pre>
    </>
  )
}

function SchedulePicture({ frame }: { frame: number }) {
  return (
    <>
      <div className="flex items-center gap-3 text-sm font-medium">
        <span className={cn('relative h-5 w-9 rounded-full transition-colors', frame >= 1 ? 'bg-primary' : 'bg-input')}>
          <span className={cn('absolute top-0.5 size-4 rounded-full bg-background shadow transition-all', frame >= 1 ? 'left-[18px]' : 'left-0.5')} />
        </span>
        Run on a schedule
      </div>
      <div className="flex gap-2">
        <Pill on>Daily</Pill>
        <Pill on={false}>Weekly</Pill>
        <Pill on={false}>Monthly</Pill>
      </div>
      <div className={cn(fakeInput, 'w-32 tracking-normal')}>02:00</div>
      <Reveal on={frame >= 2} className="flex items-center gap-2 text-sm font-medium text-success">
        <Clock className="size-4" /> Next backup shows in the header.
      </Reveal>
      <Reveal on={frame >= 3}>
        <p className="text-sm text-muted-foreground">On a Mac, the menu bar shows the same time while the app is open.</p>
      </Reveal>
    </>
  )
}
