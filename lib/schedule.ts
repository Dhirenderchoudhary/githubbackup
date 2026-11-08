import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { jobPath, readJob, startBackup } from './jobs'
import { describeNext, due, loadSettings, saveSettings, settingsPath } from './machine-settings'
import { updateTray } from './tray'

let started = false

export function startScheduler(): void {
  if (started || process.env.VERCEL || process.env.NEXT_PHASE === 'phase-production-build') return
  started = true
  setInterval(() => {
    void tick().then(refreshTray).catch(console.error)
  }, 20_000)
  void tick().then(refreshTray).catch(console.error)
}

export async function refreshTray(): Promise<void> {
  const settings = await loadSettings(settingsPath())
  await updateTray(settings.schedule.enabled ? describeNext(settings.schedule) : null)
}

export async function scheduleStatus(): Promise<{ label: string, enabled: boolean }> {
  const settings = await loadSettings(settingsPath())
  return { label: describeNext(settings.schedule), enabled: settings.schedule.enabled }
}

async function tick(): Promise<void> {
  const path = settingsPath()
  const settings = await loadSettings(path)
  const slot = due(settings.schedule, new Date(), settings.schedule.lastSlot)
  if (!slot) return
  const current = await readJob()
  if (current?.running) return
  settings.schedule.lastSlot = slot
  await saveSettings(path, settings)
  try {
    await startBackup(settings)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const file = jobPath()
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify({
      running: false,
      lines: [message],
      repos: [],
      error: message,
      startedAt: new Date().toISOString(),
    }))
  }
}
