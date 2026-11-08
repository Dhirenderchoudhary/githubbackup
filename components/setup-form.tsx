'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, CircleAlert, ExternalLink, KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/page-header'
import { beats } from '@/lib/flow'

type View = { tokenSource: 'saved' | 'env' | 'missing', error?: string }

const sourceText = {
  saved: 'A token is stored on this computer. Saving a new one replaces it.',
  env: 'GITHUB_TOKEN from .env is ready. You can leave the box empty.',
  missing: 'No token yet. Paste one below, or set GITHUB_TOKEN in .env.',
}

export function SetupForm() {
  const router = useRouter()
  const beat = beats[0]
  const [token, setToken] = useState('')
  const [view, setView] = useState<View | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    void fetch('/api/settings').then(async (response) => {
      const body = await response.json() as View
      setView(response.ok ? body : { tokenSource: 'missing', error: body.error })
    })
  }, [])

  async function save(nextToken: string) {
    setMessage('')
    setSaving(true)
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: nextToken }),
    })
    const body = await response.json() as View
    setSaving(false)
    if (!response.ok) {
      setMessage(body.error ?? 'Could not save the token')
      return
    }
    setToken('')
    setView(body)
    if (!nextToken) {
      setMessage(body.tokenSource === 'env' ? 'Removed. gitbackup now uses GITHUB_TOKEN from .env.' : 'Removed. Add a token here, or set GITHUB_TOKEN in .env.')
      return
    }
    router.push('/repos')
  }

  const ready = view !== null && view.tokenSource !== 'missing'

  return (
    <>
      <PageHeader step={beat.n} title={beat.label}>{beat.body}</PageHeader>
      <Card className="mt-8 max-w-xl animate-rise shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="size-4.5 text-primary" aria-hidden /> GitHub token</CardTitle>
          <CardDescription>A classic token needs the repo scope. Add read:org to include organization repositories.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${ready ? 'border-primary/30 bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
            {view === null ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" /> : ready ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
            <span>{view?.error ?? (view ? sourceText[view.tokenSource] : 'Checking for a token')}</span>
          </div>
          <form className="mt-5 grid gap-2" onSubmit={(event) => { event.preventDefault(); void save(token.trim()) }}>
            <Label htmlFor="token">Paste a token</Label>
            <Input id="token" type="password" autoComplete="off" spellCheck={false} value={token} placeholder="github_pat_… or ghp_…" onChange={(event) => setToken(event.target.value)} />
            <a className="inline-flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline" href="https://github.com/settings/tokens/new?scopes=repo,read:org&description=gitbackup" target="_blank" rel="noreferrer">
              Create a token with the right scopes <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <p className="text-sm text-muted-foreground">Saved to ~/.config/gitbackup/settings.json on this computer, readable only by you. It is used before GITHUB_TOKEN in .env.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {token.length > 0 || !ready ? (
                <Button type="submit" disabled={token.trim().length === 0 || saving}>
                  {saving ? <Loader2 className="animate-spin" /> : null} Save and continue <ArrowRight />
                </Button>
              ) : (
                <Button type="button" onClick={() => router.push('/repos')}>Continue <ArrowRight /></Button>
              )}
              {view?.tokenSource === 'saved' ? (
                <Button type="button" variant="outline" onClick={() => void save('')}>Remove the saved token</Button>
              ) : null}
            </div>
          </form>
          {message ? <p role="status" className="mt-4 text-sm text-muted-foreground animate-in fade-in">{message}</p> : null}
        </CardContent>
      </Card>
    </>
  )
}
