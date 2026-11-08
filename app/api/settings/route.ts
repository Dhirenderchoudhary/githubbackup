import { NextResponse } from 'next/server'
import { localOnly } from '@/lib/local-request'
import { loadSettings, saveSettings, settingsPath, viewSettings, type LocalSettings } from '@/lib/machine-settings'
import { refreshTray } from '@/lib/schedule'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const blocked = localOnly(request)
  if (blocked) return blocked
  const settings = await loadSettings(settingsPath())
  return NextResponse.json(viewSettings(settings, Boolean(process.env.GITHUB_TOKEN)))
}

export async function POST(request: Request) {
  const blocked = localOnly(request)
  if (blocked) return blocked
  const body = await request.json() as Partial<LocalSettings> & { token?: string }
  const current = await loadSettings(settingsPath())
  const next: LocalSettings = {
    token: typeof body.token === 'string' ? body.token : current.token,
    filters: body.filters ?? current.filters,
    selected: body.selected ?? current.selected,
    schedule: body.schedule ? { ...current.schedule, ...body.schedule, lastSlot: current.schedule.lastSlot } : current.schedule,
  }
  await saveSettings(settingsPath(), next)
  await refreshTray()
  return NextResponse.json(viewSettings(next, Boolean(process.env.GITHUB_TOKEN)))
}
