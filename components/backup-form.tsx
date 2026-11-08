'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CircleAlert, CircleMinus, Clock, Loader2, Play, Server, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { PageHeader } from '@/components/page-header'
import { destinationCopy, type DestinationKind } from '@/lib/example'
import { beats, stageLabel } from '@/lib/flow'
import { cn } from '@/lib/utils'

type Stage = keyof typeof stageLabel
type Repo = { name: string, stage: Stage, message: string }
type Job = { running: boolean, lines: string[], repos: Repo[], error: string }
type Destination = { kind: DestinationKind, where: string } | { error: string }

const stageView = {
  pending: { label: stageLabel.pending, icon: Clock, tone: 'text-muted-foreground', spin: false },
  cloning: { label: stageLabel.cloning, icon: Loader2, tone: 'text-warning', spin: true },
  done: { label: stageLabel.done, icon: CheckCircle2, tone: 'text-success', spin: false },
  failed: { label: stageLabel.failed, icon: XCircle, tone: 'text-destructive', spin: false },
  skipped: { label: 'Not run', icon: CircleMinus, tone: 'text-muted-foreground', spin: false },
}

const reportLine = /^(personal repos|commits|open source contributions|merged pull requests) (\d+)$/

export function BackupForm() {
  const beat = beats[2]
  const logRef = useRef<HTMLPreElement>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [acceptRemoved, setAcceptRemoved] = useState(false)
  const [message, setMessage] = useState('')
  const [destination, setDestination] = useState<Destination | null>(null)

  useEffect(() => {
    void fetch('/api/destination')
      .then((response) => response.json() as Promise<Destination>)
      .then(setDestination)
      .catch(() => setDestination({ error: 'Could not read the destination from .env' }))
  }, [])

  useEffect(() => {
    let stop = false
    const load = () => {
      fetch('/api/backup')
        .then((response) => response.ok ? response.json() as Promise<{ job: Job | null }> : null)
        .then((body) => {
          if (!stop && body) setJob(body.job)
        })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 800)
    return () => {
      stop = true
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    const node = logRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [job?.lines])

  async function start() {
    setMessage('')
    const response = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acceptRemoved }),
    })
    const body = await response.json() as { job?: Job, error?: string }
    if (!response.ok) {
      setMessage(body.error ?? 'Could not start')
      return
    }
    if (body.job) setJob(body.job)
  }

  const repos = job?.repos ?? []
  const saved = repos.filter((repo) => repo.stage === 'done').length
  const ready = destination !== null && 'kind' in destination
  const outcome = job && !job.running && !job.error ? job.lines.findLast((line) => line === 'published' || line === 'unchanged') : undefined
  const counts = (job?.lines ?? []).flatMap((line) => {
    const match = reportLine.exec(line)
    return match ? [{ label: match[1], value: match[2] }] : []
  })

  return (
    <>
      <PageHeader step={beat.n} title={beat.label}>{beat.body}</PageHeader>
      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-4">
          <div className={cn('flex items-start gap-3 rounded-xl border p-4 animate-rise', ready ? 'bg-card' : destination ? 'border-warning/40 bg-warning/5' : 'bg-card')}>
            {destination === null ? <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-muted-foreground" /> : ready ? <Server className="mt-0.5 size-5 shrink-0 text-primary" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" />}
            <div className="min-w-0 text-sm">
              {destination === null ? <p className="text-muted-foreground">Reading the destination from .env</p> : null}
              {destination && 'kind' in destination ? (
                <p><strong className="font-semibold">{destinationCopy(destination.kind).name}</strong> <span className="break-all text-muted-foreground">{destination.where}</span></p>
              ) : null}
              {destination && 'error' in destination ? (
                <>
                  <p><strong className="font-semibold">No destination yet.</strong> {destination.error}</p>
                  <p className="mt-1 text-muted-foreground">Fill in that destination&apos;s block in .env, then reload this page. .env.example lists the names.</p>
                </>
              ) : null}
            </div>
          </div>

          {outcome ? (
            <div className="rounded-xl border border-primary/30 bg-accent p-4 text-accent-foreground animate-in fade-in slide-in-from-bottom-2">
              <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-5" /> {outcome === 'published' ? 'Backup published.' : 'Already up to date. Nothing new to upload.'}</p>
              {counts.length ? (
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {counts.map((count) => (
                    <div key={count.label} className="rounded-lg bg-card/70 p-3">
                      <dt className="text-xs text-muted-foreground first-letter:uppercase">{count.label}</dt>
                      <dd className="font-serif text-2xl text-foreground tabular-nums">{count.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          ) : null}
          {message ? <p role="status" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message}</p> : null}
          {job?.error && !job.running ? <p role="status" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive break-words">{job.error}</p> : null}

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <span className="text-sm font-medium">Repositories</span>
              {repos.length > 0 ? <span className="text-sm text-muted-foreground tabular-nums">{saved} of {repos.length} saved</span> : null}
            </div>
            {repos.length > 0 ? <Progress value={(saved / repos.length) * 100} className="h-1 rounded-none" /> : null}
            <div className="max-h-[28rem] overflow-y-auto">
              {repos.map((repo) => {
                const view = stageView[repo.stage === 'pending' && !job?.running ? 'skipped' : repo.stage] ?? stageView.failed
                const Icon = view.icon
                return (
                  <div key={repo.name} className="flex items-start gap-3 border-b px-4 py-2.5 text-sm last:border-b-0">
                    <Icon className={cn('mt-0.5 size-4 shrink-0', view.tone, view.spin && 'animate-spin')} aria-hidden />
                    <span className="min-w-0 flex-1 break-all">{repo.name}{repo.message ? <span className="block text-xs break-words text-muted-foreground">{repo.message}</span> : null}</span>
                    <span className={cn('shrink-0 text-xs font-medium', view.tone)}>{view.label}</span>
                  </div>
                )
              })}
              {repos.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Each repository you saved on the previous step shows its status here.</p> : null}
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-4">
          <div className="rounded-xl border bg-card p-4 shadow-soft">
            <Button size="lg" className="w-full" type="button" onClick={() => void start()} disabled={!ready || job?.running === true}>
              {job?.running ? <><Loader2 className="animate-spin" /> Backup running</> : <><Play /> Start backup</>}
            </Button>
            <div className="mt-4 flex items-start gap-2.5">
              <Checkbox id="accept-removed" checked={acceptRemoved} onCheckedChange={(value) => setAcceptRemoved(value === true)} className="mt-0.5" />
              <Label htmlFor="accept-removed" className="leading-snug font-normal">A repository from the last backup is gone</Label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">The run stops when GitHub no longer lists a repository the last backup included. Tick this only to publish that smaller set.</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-code-border bg-code">
            <p className="border-b border-code-border px-4 py-2 text-xs font-medium text-code-foreground/70">Log</p>
            <pre ref={logRef} className="max-h-80 min-h-40 overflow-y-auto p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-code-foreground">{job?.lines.join('\n') || 'The log will appear here.'}</pre>
          </div>
        </aside>
      </div>
    </>
  )
}
