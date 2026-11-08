import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { runGitbackup } from './engine'
import { filterFlag, type LocalSettings } from './machine-settings'

export interface JobRepo {
  name: string
  stage: 'pending' | 'cloning' | 'done' | 'failed'
  message: string
}

export interface Job {
  running: boolean
  lines: string[]
  repos: JobRepo[]
  error: string
  startedAt: string
}

let writing: Promise<void> = Promise.resolve()

export function jobPath(): string {
  return join(homedir(), '.cache', 'gitbackup', 'job.json')
}

export async function readJob(): Promise<Job | null> {
  try {
    return JSON.parse(await readFile(jobPath(), 'utf8')) as Job
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

export async function startBackup(settings: LocalSettings, acceptRemoved = false): Promise<Job> {
  const current = await readJob()
  if (current?.running) return current
  const token = settings.token || process.env.GITHUB_TOKEN || ''
  if (!token) throw new Error('Add a GitHub token on the Setup screen or in .env')
  if (settings.selected.length === 0) throw new Error('Select at least one repository')
  const job: Job = {
    running: true,
    lines: ['Backup started'],
    repos: settings.selected.map((name) => ({ name, stage: 'pending', message: '' })),
    error: '',
    startedAt: new Date().toISOString(),
  }
  writing = writing.then(() => writeJob(job))
  await writing
  const args = ['backup', '--progress', '--filters', filterFlag(settings.filters), '--select', settings.selected.join(',')]
  if (acceptRemoved) args.push('--accept-removed')
  void runGitbackup(args, token, (line) => {
    applyLine(job, line)
    writing = writing.then(() => writeJob(job))
  }).then(async (result) => {
    job.running = false
    if (result.code !== 0) {
      job.error = result.stderr.trim() || 'Backup failed'
      job.lines.push(job.error)
    }
    await writing
    await writeJob(job)
  }).catch(async (error: unknown) => {
    job.running = false
    job.error = error instanceof Error ? error.message : String(error)
    job.lines.push(job.error)
    await writeJob(job)
  })
  return job
}

function applyLine(job: Job, line: string) {
  if (line.startsWith('status\t')) {
    const [, name, stage, message] = line.split('\t')
    const row = job.repos.find((repo) => repo.name === name)
    const next = stage === 'cloning' || stage === 'done' || stage === 'failed' ? stage : 'failed'
    if (row) {
      row.stage = next
      row.message = message ?? ''
    } else if (name) {
      job.repos.push({ name, stage: next, message: message ?? '' })
    }
    job.lines.push(`${name} ${next === 'done' ? 'saved' : next}${message ? ` ${message}` : ''}`)
    return
  }
  if (line.trim()) job.lines.push(line)
}

async function writeJob(job: Job): Promise<void> {
  await mkdir(join(homedir(), '.cache', 'gitbackup'), { recursive: true })
  await writeFile(jobPath(), JSON.stringify(job))
}
