import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface RepoFilters {
  owned: boolean
  organization: boolean
  starred: boolean
  forked: boolean
  collaborator: boolean
}

export interface ScheduleSettings {
  enabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly'
  time: string
  dayOfWeek: number
  dayOfMonth: number
  lastSlot: string
}

export interface LocalSettings {
  token: string
  filters: RepoFilters
  selected: string[]
  schedule: ScheduleSettings
}

export function settingsPath(): string {
  return join(homedir(), '.config', 'gitbackup', 'settings.json')
}

export function defaultSettings(): LocalSettings {
  return {
    token: '',
    filters: { owned: true, organization: false, starred: false, forked: false, collaborator: false },
    selected: [],
    schedule: { enabled: false, frequency: 'daily', time: '02:00', dayOfWeek: 1, dayOfMonth: 1, lastSlot: '' },
  }
}

export async function loadSettings(path: string): Promise<LocalSettings> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return defaultSettings()
    throw error
  }
  return normalize(JSON.parse(text) as unknown)
}

export async function saveSettings(path: string, settings: LocalSettings): Promise<void> {
  const clean = normalize(settings)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, `${JSON.stringify(clean, null, 2)}\n`, { mode: 0o600 })
  await chmod(path, 0o600)
}

export function viewSettings(settings: LocalSettings, envHasToken: boolean) {
  return {
    tokenSource: settings.token ? 'saved' as const : envHasToken ? 'env' as const : 'missing' as const,
    filters: settings.filters,
    selected: settings.selected,
    schedule: {
      enabled: settings.schedule.enabled,
      frequency: settings.schedule.frequency,
      time: settings.schedule.time,
      dayOfWeek: settings.schedule.dayOfWeek,
      dayOfMonth: settings.schedule.dayOfMonth,
    },
  }
}

export function filterFlag(filters: RepoFilters): string {
  const names = (['owned', 'organization', 'starred', 'forked', 'collaborator'] as const).filter((name) => filters[name])
  return names.length ? names.join(',') : 'none'
}

export function describeNext(schedule: ScheduleSettings, now = new Date()): string {
  if (!schedule.enabled) return 'Schedule off'
  const when = new Date(now)
  when.setSeconds(0, 0)
  const [hour, minute] = clock(schedule.time)
  for (let day = 0; day < 370; day += 1) {
    const candidate = new Date(when)
    candidate.setDate(when.getDate() + day)
    candidate.setHours(hour, minute, 0, 0)
    if (candidate <= now) continue
    if (schedule.frequency === 'weekly' && candidate.getDay() !== schedule.dayOfWeek) continue
    if (schedule.frequency === 'monthly' && candidate.getDate() !== schedule.dayOfMonth) continue
    return `Next backup ${candidate.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
  }
  return 'Schedule off'
}

export function due(schedule: ScheduleSettings, now: Date, lastSlot: string): string | null {
  const slot = currentSlot(schedule, now)
  if (!slot || slot === lastSlot) return null
  return slot
}

export function currentSlot(schedule: ScheduleSettings, now: Date): string | null {
  if (!schedule.enabled) return null
  const [hour, minute] = clock(schedule.time)
  if (now.getHours() !== hour || now.getMinutes() !== minute) return null
  if (schedule.frequency === 'weekly' && now.getDay() !== schedule.dayOfWeek) return null
  if (schedule.frequency === 'monthly' && now.getDate() !== schedule.dayOfMonth) return null
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${schedule.time}`
}

function normalize(value: unknown): LocalSettings {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const filters = raw.filters && typeof raw.filters === 'object' ? raw.filters as Record<string, unknown> : {}
  const schedule = raw.schedule && typeof raw.schedule === 'object' ? raw.schedule as Record<string, unknown> : {}
  const frequency = schedule.frequency
  const time = typeof schedule.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time) ? schedule.time : '02:00'
  return {
    token: typeof raw.token === 'string' ? raw.token : '',
    filters: {
      owned: filters.owned !== false,
      organization: filters.organization === true,
      starred: filters.starred === true,
      forked: filters.forked === true,
      collaborator: filters.collaborator === true,
    },
    selected: Array.isArray(raw.selected) ? raw.selected.filter((item): item is string => typeof item === 'string' && item.includes('/')) : [],
    schedule: {
      enabled: schedule.enabled === true,
      frequency: frequency === 'weekly' || frequency === 'monthly' ? frequency : 'daily',
      time,
      dayOfWeek: clamp(schedule.dayOfWeek, 0, 6, 1),
      dayOfMonth: clamp(schedule.dayOfMonth, 1, 31, 1),
      lastSlot: typeof schedule.lastSlot === 'string' ? schedule.lastSlot : '',
    },
  }
}

function clock(time: string): [number, number] {
  const [hour, minute] = time.split(':').map(Number)
  return [hour, minute]
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(number) || number < min || number > max) return fallback
  return number
}
