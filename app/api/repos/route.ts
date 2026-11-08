import { NextResponse } from 'next/server'
import { runGitbackup } from '@/lib/engine'
import { localOnly } from '@/lib/local-request'
import { filterFlag, loadSettings, settingsPath } from '@/lib/machine-settings'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const blocked = localOnly(request)
  if (blocked) return blocked
  const settings = await loadSettings(settingsPath())
  const token = settings.token || process.env.GITHUB_TOKEN || ''
  if (!token) return NextResponse.json({ error: 'Add a GitHub token on the Setup screen or in .env' }, { status: 400 })
  const url = new URL(request.url)
  const filters = url.searchParams.get('filters') || filterFlag(settings.filters)
  let stdout = ''
  const result = await runGitbackup(['repos', '--filters', filters], token, (line) => {
    stdout += `${line}\n`
  })
  if (result.code !== 0) return NextResponse.json({ error: result.stderr.trim() || 'Could not list repositories' }, { status: 400 })
  return NextResponse.json({ repos: JSON.parse(stdout) as unknown })
}
