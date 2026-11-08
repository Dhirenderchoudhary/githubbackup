'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Lock, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/page-header'
import { beats, groups, sourceLabel, type GroupId } from '@/lib/flow'
import { cn } from '@/lib/utils'

type Filters = Record<GroupId, boolean>
type Repo = { fullName: string, private: boolean, source: string, description: string | null }

const emptyFilters: Filters = { owned: true, organization: false, starred: false, forked: false, collaborator: false }

export function ReposForm() {
  const router = useRouter()
  const beat = beats[1]
  const latest = useRef(0)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const run = ++latest.current
    void (async () => {
      const response = await fetch('/api/settings')
      if (run !== latest.current) return
      if (!response.ok) {
        const body = await response.json() as { error?: string }
        setMessage(body.error ?? 'Open this page on your computer.')
        return
      }
      const body = await response.json() as { filters: Filters, selected: string[], tokenSource: string }
      setFilters(body.filters)
      if (body.tokenSource === 'missing') {
        setMessage('Add a GitHub token on Setup first.')
        return
      }
      await show(body.filters, body.selected, null)
    })()
    return () => {
      latest.current += 1
    }
  }, [])

  // `previous` is the list on screen before this load. Repositories that were not on it start selected.
  async function show(nextFilters: Filters, already: string[], previous: Repo[] | null) {
    const run = ++latest.current
    setLoading(true)
    setMessage('Loading repositories')
    const flag = groups.filter((group) => nextFilters[group.id]).map((group) => group.id).join(',') || 'none'
    const saved = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filters: nextFilters }),
    })
    if (run !== latest.current) return
    if (!saved.ok) {
      setLoading(false)
      setMessage('Could not save the groups')
      return
    }
    const response = await fetch(`/api/repos?filters=${flag}`)
    const body = await response.json() as { repos?: Repo[], error?: string }
    if (run !== latest.current) return
    setLoading(false)
    if (!response.ok) {
      setMessage(body.error ?? 'Could not list repositories')
      return
    }
    const list = body.repos ?? []
    const shown = new Set(previous?.map((repo) => repo.fullName))
    const chosen = previous
      ? list.map((repo) => repo.fullName).filter((name) => already.includes(name) || !shown.has(name))
      : already.length === 0
        ? list.map((repo) => repo.fullName)
        : list.map((repo) => repo.fullName).filter((name) => already.includes(name))
    setRepos(list)
    setSelected(chosen)
    setMessage(list.length === 0 ? 'No repositories in the groups you ticked.' : '')
  }

  function toggleGroup(id: GroupId) {
    const next = { ...filters, [id]: !filters[id] }
    setFilters(next)
    void show(next, selected, repos ?? [])
  }

  function toggle(fullName: string) {
    setSelected((current) => current.includes(fullName) ? current.filter((name) => name !== fullName) : [...current, fullName])
  }

  async function saveAndContinue() {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filters, selected }),
    })
    if (!response.ok) {
      setMessage('Could not save the selection')
      return
    }
    router.push('/backup')
  }

  const needle = query.trim().toLowerCase()
  const visible = (repos ?? []).filter((repo) => !needle || repo.fullName.toLowerCase().includes(needle) || repo.description?.toLowerCase().includes(needle))
  const allVisibleSelected = visible.length > 0 && visible.every((repo) => selected.includes(repo.fullName))
  const visibleNames = new Set(visible.map((repo) => repo.fullName))

  return (
    <>
      <PageHeader step={beat.n} title={beat.label}>{beat.body}</PageHeader>
      <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {groups.map((group) => {
          const on = filters[group.id]
          return (
            <button
              key={group.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleGroup(group.id)}
              className={cn(
                'relative rounded-xl border bg-card p-3.5 text-left transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                on ? 'border-primary bg-accent ring-1 ring-primary' : 'hover:-translate-y-0.5 hover:shadow-soft',
              )}
            >
              <span className={cn('absolute top-3 right-3 grid size-4 place-items-center rounded-[4px] border transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background')}>
                {on ? <Check className="size-3" /> : null}
              </span>
              <strong className="block pr-6 font-semibold">{group.label}</strong>
              <span className="mt-1 block text-xs text-muted-foreground">{group.help}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            className="bg-card pl-9"
            placeholder="Filter by name or description"
            aria-label="Filter repositories"
            value={query}
            disabled={!repos?.length}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="bg-card"
          disabled={visible.length === 0}
          onClick={() => setSelected((current) => allVisibleSelected
            ? current.filter((name) => !visibleNames.has(name))
            : [...new Set([...current, ...visibleNames])])}
        >
          {allVisibleSelected ? 'Clear' : 'Select'} {needle ? 'these' : 'all'}
        </Button>
      </div>
      <div className={cn('mt-3 max-h-[32rem] overflow-y-auto rounded-xl border bg-card transition-opacity', loading && repos ? 'opacity-60' : '')} aria-busy={loading}>
        {visible.map((repo) => {
          const checked = selected.includes(repo.fullName)
          return (
            <label key={repo.fullName} className={cn('flex cursor-pointer items-start gap-3 border-b px-4 py-3 last:border-b-0 transition-colors hover:bg-muted/60', checked ? '' : 'opacity-75')}>
              <Checkbox checked={checked} onCheckedChange={() => toggle(repo.fullName)} className="mt-0.5" aria-label={repo.fullName} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <strong className="font-medium break-all">{repo.fullName}</strong>
                  <Badge variant="outline" className="font-normal text-muted-foreground">{sourceLabel[repo.source] ?? repo.source}</Badge>
                  {repo.private ? <Badge variant="secondary" className="gap-1 font-normal"><Lock className="size-3" />Private</Badge> : null}
                </span>
                {repo.description ? <span className="mt-0.5 block text-sm text-muted-foreground">{repo.description}</span> : null}
              </span>
            </label>
          )
        })}
        {repos === null && loading ? Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0">
            <span className="size-4 animate-pulse rounded bg-muted" />
            <span className="h-4 animate-pulse rounded bg-muted" style={{ width: `${40 + (index * 13) % 40}%` }} />
          </div>
        )) : null}
        {repos === null && !loading ? <p className="p-6 text-center text-sm text-muted-foreground">The list appears once a token is set.</p> : null}
        {repos?.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nothing matched those groups.</p> : null}
        {repos && repos.length > 0 && visible.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No repository matches “{query}”.</p> : null}
      </div>
      <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-card/90 p-3 shadow-soft backdrop-blur">
        <Button type="button" onClick={() => void saveAndContinue()} disabled={loading || selected.length === 0}>
          Save {selected.length} and continue <ArrowRight />
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {message || (repos?.length ? `${selected.length} of ${repos.length} repositories selected. Branches, tags, and notes come with each one.` : '')}
        </span>
      </div>
    </>
  )
}
