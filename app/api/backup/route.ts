import { NextResponse } from 'next/server'
import { readJob, startBackup } from '@/lib/jobs'
import { localOnly } from '@/lib/local-request'
import { loadSettings, settingsPath } from '@/lib/machine-settings'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const blocked = localOnly(request)
  if (blocked) return blocked
  return NextResponse.json({ job: await readJob() })
}

export async function POST(request: Request) {
  const blocked = localOnly(request)
  if (blocked) return blocked
  const body = await request.json().catch(() => ({})) as { acceptRemoved?: boolean }
  try {
    const job = await startBackup(await loadSettings(settingsPath()), body.acceptRemoved === true)
    return NextResponse.json({ job })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
