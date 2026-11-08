import { mkdir, open, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError, summarizeContributions, type DestinationKind, type UserDetails } from './domain.ts'
import type { Publisher } from './bucket.ts'
import type { Github, RemoteRepo, RepoFilters } from './github.ts'
import { authoredCommitCount, gitLfsAvailable, syncMirror } from './mirror.ts'

export interface BackupResult {
  status: 'published' | 'unchanged'
  destination: DestinationKind
  repoCount: number
  commitCount: number
  openSourceContributionCount: number
  mergedPullRequestCount: number
}

export interface BackupEvent {
  name: string
  stage: 'cloning' | 'done' | 'failed'
  message?: string
}

export async function backup(opts: {
  github: Github
  destination: Publisher
  cacheDir: string
  token: string
  acceptRemoved?: boolean
  now?: () => string
  lfsAvailable?: boolean
  filters?: RepoFilters
  selected?: string[]
  onEvent?: (event: BackupEvent) => void
}): Promise<BackupResult> {
  await mkdir(opts.cacheDir, { recursive: true })
  const release = await lock(opts.cacheDir)
  try {
    const profile = await opts.github.profile()
    const picked = Boolean(opts.filters) || Boolean(opts.selected?.length)
    const [listed, activity] = await Promise.all([
      picked
        ? opts.github.listRepos(opts.filters ?? { owned: true, organization: true, starred: true, forked: true, collaborator: true })
        : opts.github.listPersonalRepos(),
      opts.github.openSourceActivity(profile.login),
    ])
    const repos = chooseRepos(listed, profile.login, opts.selected, picked)
    const previous = await opts.destination.current()
    if (previous && !opts.acceptRemoved) {
      const next = new Set(repos.map((repo) => repo.key))
      const removed = previous.repoNames.filter((name) => !next.has(name))
      if (removed.length > 0) {
        throw new AppError(`refusing to drop ${removed.join(', ')}. Pass --accept-removed to publish a smaller backup.`, 1)
      }
    }
    const lfsAvailable = opts.lfsAvailable ?? await gitLfsAvailable()
    const failures: { name: string, message: string }[] = []
    const mirrored: Mirrored[] = []
    await pool(repos, 3, async (repo) => {
      opts.onEvent?.({ name: repo.repo.fullName, stage: 'cloning' })
      try {
        const dest = join(opts.cacheDir, 'mirrors', `${repo.key}.git`)
        const mirror = await syncMirror({ cloneUrl: repo.repo.cloneUrl, dest, token: opts.token, lfsAvailable })
        const commitCount = await authoredCommitCount(dest, profile)
        mirrored.push({ repo: repo.repo, key: repo.key, dest, mirror, commitCount })
        opts.onEvent?.({ name: repo.repo.fullName, stage: 'done' })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failures.push({ name: repo.key, message })
        opts.onEvent?.({ name: repo.repo.fullName, stage: 'failed', message })
      }
    })
    if (failures.length > 0) {
      throw new AppError(`backup incomplete, nothing published\n${failures.map((failure) => `${failure.name}: ${failure.message}`).join('\n')}`, 1)
    }
    mirrored.sort((a, b) => a.key.localeCompare(b.key))
    const contributions = summarizeContributions(activity.items, profile.login, {
      contributionCount: activity.contributionCount,
      mergedCount: activity.mergedCount,
      truncated: activity.truncated,
    })
    const commitCount = mirrored.reduce((sum, repo) => sum + repo.commitCount, 0)
    const details: UserDetails = {
      login: profile.login,
      id: profile.id,
      name: profile.name,
      bio: profile.bio,
      company: profile.company,
      location: profile.location,
      blog: profile.blog,
      twitter: profile.twitter,
      htmlUrl: profile.htmlUrl,
      createdAt: profile.createdAt,
      repoCount: mirrored.length,
      commitCount,
      openSourceContributionCount: contributions.openSourceContributionCount,
      mergedPullRequestCount: contributions.mergedPullRequestCount,
      contributedRepos: contributions.contributedRepos,
      openSourcePullRequests: {
        totalCount: contributions.openSourceContributionCount,
        truncated: activity.truncated,
        items: contributions.pullRequests,
      },
      repos: mirrored.map((repo) => ({
        name: repo.key,
        private: repo.repo.private,
        description: repo.repo.description,
        language: repo.repo.language,
        defaultBranch: repo.repo.defaultBranch,
        createdAt: repo.repo.createdAt,
        pushedAt: repo.repo.pushedAt,
        commitCount: repo.commitCount,
        empty: repo.mirror.empty,
      })),
    }
    const status = await opts.destination.publish({
      createdAt: opts.now ? opts.now() : new Date().toISOString(),
      details,
      mirrors: mirrored.map((repo) => ({
        name: repo.key,
        bareDir: repo.dest,
        refs: repo.mirror.refs,
        commitCount: repo.commitCount,
        empty: repo.mirror.empty,
      })),
    })
    return {
      status,
      destination: opts.destination.kind,
      repoCount: details.repoCount,
      commitCount: details.commitCount,
      openSourceContributionCount: details.openSourceContributionCount,
      mergedPullRequestCount: details.mergedPullRequestCount,
    }
  } finally {
    await release()
  }
}

export function formatReport(result: BackupResult): string {
  return [
    `personal repos ${result.repoCount}`,
    `commits ${result.commitCount}`,
    `open source contributions ${result.openSourceContributionCount}`,
    `merged pull requests ${result.mergedPullRequestCount}`,
    `destination ${result.destination}`,
    result.status,
  ].join('\n')
}

export function chooseRepos(repos: readonly RemoteRepo[], login: string, selected: readonly string[] | undefined, named: boolean): { repo: RemoteRepo, key: string }[] {
  const wanted = selected && selected.length > 0 ? new Set(selected) : null
  const picked = wanted ? repos.filter((repo) => wanted.has(repo.fullName)) : [...repos]
  if (wanted && selected) {
    const found = new Set(picked.map((repo) => repo.fullName))
    const missing = selected.filter((name) => !found.has(name))
    if (missing.length > 0) throw new AppError(`not in the current filters: ${missing.join(', ')}`, 2)
  }
  const jobs = picked.map((repo) => ({
    repo,
    key: named && (repo.fork || repo.ownerLogin.toLowerCase() !== login.toLowerCase()) ? `${repo.ownerLogin}__${repo.name}` : repo.name,
  }))
  const keys = jobs.map((job) => job.key)
  if (new Set(keys).size !== keys.length) throw new AppError('two repositories would share one archive name', 1)
  return jobs.sort((a, b) => a.key.localeCompare(b.key))
}

interface Mirrored {
  repo: RemoteRepo
  key: string
  dest: string
  mirror: Awaited<ReturnType<typeof syncMirror>>
  commitCount: number
}

async function pool<T>(items: readonly T[], width: number, task: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    while (index < items.length) {
      const current = index
      index += 1
      await task(items[current])
    }
  })
  await Promise.all(workers)
}

async function lock(dir: string): Promise<() => Promise<void>> {
  const path = join(dir, 'lock')
  const fd = await acquire(path)
  await fd.writeFile(String(process.pid))
  await fd.close()
  return async () => {
    const current = await readFile(path, 'utf8').catch(() => '')
    if (current.trim() === String(process.pid)) await rm(path, { force: true })
  }
}

async function acquire(path: string): Promise<Awaited<ReturnType<typeof open>>> {
  try {
    return await open(path, 'wx')
  } catch {
    const existing = await readFile(path, 'utf8').catch(() => '')
    const pid = Number(existing)
    if (pid > 0 && alive(pid)) throw new AppError('another gitbackup run is using this cache', 1)
    await rm(path, { force: true })
    return open(path, 'wx')
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
