import { NextResponse } from 'next/server'
import { runGitbackup } from '@/lib/engine'
import { localOnly } from '@/lib/local-request'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const blocked = localOnly(request)
  if (blocked) return blocked
  let stdout = ''
  const result = await runGitbackup(['check'], process.env.GITHUB_TOKEN ?? '', (line) => {
    stdout += line
  })
  if (result.code !== 0) return NextResponse.json({ error: result.stderr.trim() || 'Could not read the destination from .env' })
  return NextResponse.json(JSON.parse(stdout) as { kind: string, where: string })
}
