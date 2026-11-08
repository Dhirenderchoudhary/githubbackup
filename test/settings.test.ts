import assert from 'node:assert/strict'
import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { defaultSettings, describeNext, due, loadSettings, saveSettings } from '../lib/machine-settings.ts'

test('a saved token is readable only by this user', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gitbackup-settings-'))
  const file = join(dir, 'settings.json')
  const settings = defaultSettings()
  settings.token = 'secret-token'
  settings.filters.forked = true
  settings.selected = ['kaiser/app']
  await saveSettings(file, settings)
  const mode = (await stat(file)).mode & 0o777
  assert.equal(mode, 0o600)
  const loaded = await loadSettings(file)
  assert.equal(loaded.token, 'secret-token')
  assert.equal(loaded.filters.forked, true)
  assert.deepEqual(loaded.selected, ['kaiser/app'])
  const missing = await loadSettings(join(dir, 'missing.json'))
  assert.equal(missing.token, '')
  assert.equal(missing.filters.owned, true)
})

test('a daily slot fires once during that minute', () => {
  const schedule = { enabled: true, frequency: 'daily' as const, time: '02:00', dayOfWeek: 1, dayOfMonth: 1, lastSlot: '' }
  const now = new Date(2026, 10, 5, 2, 0, 30)
  assert.equal(due(schedule, now, ''), '2026-11-5 02:00')
  assert.equal(due(schedule, now, '2026-11-5 02:00'), null)
  assert.equal(due({ ...schedule, frequency: 'weekly', dayOfWeek: 1 }, now, ''), null)
  assert.equal(due({ ...schedule, frequency: 'weekly', dayOfWeek: now.getDay() }, now, ''), '2026-11-5 02:00')
  assert.equal(describeNext(schedule, new Date(2026, 10, 5, 3, 0, 0)), 'Next backup Fri, Nov 6, 2:00 AM')
  assert.equal(describeNext({ ...schedule, enabled: false }, now), 'Schedule off')
})
