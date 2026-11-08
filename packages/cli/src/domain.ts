import { createHash } from 'node:crypto'

export type DestinationKind = 's3' | 'r2' | 'drive'

export class AppError extends Error {
  readonly exitCode: 1 | 2
  constructor(message: string, exitCode: 1 | 2) {
    super(message)
    this.name = 'AppError'
    this.exitCode = exitCode
  }
}

export interface Ref {
  name: string
  oid: string
}

export interface RepoIdentity {
  name: string
  fork: boolean
  ownerLogin: string
  ownerType: string
}

export interface PullRequest {
  repo: string
  number: number
  title: string
  state: string
  createdAt: string
  url: string
  merged: boolean
}

export interface RepoSummary {
  name: string
  private: boolean
  description: string | null
  language: string | null
  defaultBranch: string | null
  createdAt: string
  pushedAt: string
  commitCount: number
  empty: boolean
}

export interface UserDetails {
  login: string
  id: number
  name: string | null
  bio: string | null
  company: string | null
  location: string | null
  blog: string | null
  twitter: string | null
  htmlUrl: string | null
  createdAt: string
  repoCount: number
  commitCount: number
  openSourceContributionCount: number
  mergedPullRequestCount: number
  contributedRepos: string[]
  openSourcePullRequests: {
    totalCount: number
    truncated: boolean
    items: PullRequest[]
  }
  repos: RepoSummary[]
}

export interface AuthorIdentity {
  login: string
  id: number
  name: string | null
}

export function authoredByUser(email: string, name: string, user: AuthorIdentity): boolean {
  const emailLower = email.trim().toLowerCase()
  const login = user.login.toLowerCase()
  if (emailLower === `${user.id}+${login}@users.noreply.github.com`) return true
  if (emailLower === `${login}@users.noreply.github.com`) return true
  if (user.name && name.trim().toLowerCase() === user.name.trim().toLowerCase()) return true
  return false
}

export function isOwnRepo(fullName: string, login: string): boolean {
  const owner = fullName.slice(0, fullName.indexOf('/'))
  return owner.toLowerCase() === login.toLowerCase()
}

export function summarizeContributions(items: readonly PullRequest[], login: string, totals: {
  contributionCount: number
  mergedCount: number
  truncated: boolean
}): {
  openSourceContributionCount: number
  mergedPullRequestCount: number
  contributedRepos: string[]
  pullRequests: PullRequest[]
} {
  const pullRequests = items.filter((item) => !isOwnRepo(item.repo, login))
  return {
    openSourceContributionCount: totals.truncated ? totals.contributionCount : pullRequests.length,
    mergedPullRequestCount: totals.truncated ? totals.mergedCount : pullRequests.filter((item) => item.merged).length,
    contributedRepos: [...new Set(pullRequests.map((item) => item.repo))].sort(),
    pullRequests,
  }
}

export interface ManifestRepo {
  name: string
  commitCount: number
  empty: boolean
  refs: Ref[]
  archiveKey: string | null
  archiveSha256: string | null
  archiveBytes: number | null
}

export interface Manifest {
  format: 1
  destination: DestinationKind
  login: string
  stateId: string
  createdAt: string
  detailsSha256: string
  detailsKey: string | null
  repos: ManifestRepo[]
}

export function isPersonalRepo(repo: RepoIdentity, login: string): boolean {
  return repo.fork === false
    && repo.ownerType === 'User'
    && repo.ownerLogin.toLowerCase() === login.toLowerCase()
}

export function assertSafeRelative(path: string): void {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path
  if (normalized === '' || normalized.startsWith('/') || normalized.includes('\\') || normalized.split('/').some((part) => part === '' || part === '..')) {
    throw new AppError(`unsafe path ${path}`, 1)
  }
}

export function sha256Bytes(body: Buffer | string): string {
  return createHash('sha256').update(body).digest('hex')
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) sorted[key] = sortValue(source[key])
    return sorted
  }
  return value
}

export function repoStateOf(refs: readonly Ref[]): string {
  const sorted = [...refs].sort((a, b) => a.name.localeCompare(b.name))
  return sha256Bytes(stableStringify(sorted))
}

export function stateIdOf(login: string, repos: readonly { name: string, refs: readonly Ref[] }[]): string {
  const body = {
    login,
    repos: [...repos]
      .map((repo) => ({
        name: repo.name,
        refs: [...repo.refs].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
  return sha256Bytes(stableStringify(body))
}

export function redact(message: string, secrets: readonly string[]): string {
  let out = message
  for (const secret of secrets) {
    if (secret.length < 8) continue
    out = out.split(secret).join('[redacted]')
  }
  return out
}

export function parseManifest(value: unknown): Manifest {
  if (!value || typeof value !== 'object') throw new AppError('manifest was not an object', 1)
  const raw = value as Record<string, unknown>
  if (raw.format !== 1) throw new AppError('manifest format is not 1', 1)
  if (raw.destination !== 's3' && raw.destination !== 'r2' && raw.destination !== 'drive') {
    throw new AppError('manifest destination is invalid', 1)
  }
  if (typeof raw.login !== 'string' || raw.login === '') throw new AppError('manifest login is missing', 1)
  if (typeof raw.stateId !== 'string' || !isSha256(raw.stateId)) throw new AppError('manifest state id is invalid', 1)
  if (typeof raw.createdAt !== 'string') throw new AppError('manifest time is missing', 1)
  if (typeof raw.detailsSha256 !== 'string' || !isSha256(raw.detailsSha256)) throw new AppError('manifest details hash is invalid', 1)
  if (raw.detailsKey !== null && typeof raw.detailsKey !== 'string') throw new AppError('manifest details key is invalid', 1)
  if (!Array.isArray(raw.repos)) throw new AppError('manifest repos are missing', 1)
  const repos = raw.repos.map(parseManifestRepo)
  const names = repos.map((repo) => repo.name)
  if (new Set(names).size !== names.length) throw new AppError('manifest repeats a repo', 1)
  return {
    format: 1,
    destination: raw.destination,
    login: raw.login,
    stateId: raw.stateId,
    createdAt: raw.createdAt,
    detailsSha256: raw.detailsSha256,
    detailsKey: raw.detailsKey,
    repos,
  }
}

function parseManifestRepo(value: unknown): ManifestRepo {
  if (!value || typeof value !== 'object') throw new AppError('manifest repo was not an object', 1)
  const raw = value as Record<string, unknown>
  if (typeof raw.name !== 'string') throw new AppError('manifest repo name is missing', 1)
  assertSafeRelative(raw.name)
  if (typeof raw.commitCount !== 'number' || !Number.isInteger(raw.commitCount) || raw.commitCount < 0) {
    throw new AppError(`manifest commit count is invalid for ${raw.name}`, 1)
  }
  if (typeof raw.empty !== 'boolean') throw new AppError(`manifest empty flag is invalid for ${raw.name}`, 1)
  if (!Array.isArray(raw.refs)) throw new AppError(`manifest refs are missing for ${raw.name}`, 1)
  const refs = raw.refs.map((ref) => parseRef(ref, raw.name as string))
  const nullable = (field: 'archiveKey' | 'archiveSha256' | 'archiveBytes'): unknown => raw[field]
  const archiveKey = nullable('archiveKey')
  const archiveSha256 = nullable('archiveSha256')
  const archiveBytes = nullable('archiveBytes')
  if (archiveKey !== null && typeof archiveKey !== 'string') throw new AppError(`manifest archive key is invalid for ${raw.name}`, 1)
  if (archiveSha256 !== null && (typeof archiveSha256 !== 'string' || !isSha256(archiveSha256))) {
    throw new AppError(`manifest archive hash is invalid for ${raw.name}`, 1)
  }
  if (archiveBytes !== null && (typeof archiveBytes !== 'number' || !Number.isInteger(archiveBytes) || archiveBytes < 0)) {
    throw new AppError(`manifest archive size is invalid for ${raw.name}`, 1)
  }
  if (raw.empty === false && refs.length === 0) throw new AppError(`manifest has no refs for ${raw.name}`, 1)
  if (raw.empty === true && refs.length > 0) throw new AppError(`manifest marks ${raw.name} empty while refs exist`, 1)
  return {
    name: raw.name,
    commitCount: raw.commitCount,
    empty: raw.empty,
    refs,
    archiveKey: archiveKey,
    archiveSha256: archiveSha256,
    archiveBytes: archiveBytes,
  }
}

function parseRef(value: unknown, repo: string): Ref {
  if (!value || typeof value !== 'object') throw new AppError(`manifest ref is invalid for ${repo}`, 1)
  const raw = value as Record<string, unknown>
  if (typeof raw.name !== 'string' || !raw.name.startsWith('refs/') || raw.name.includes('..') || raw.name.includes('\n')) {
    throw new AppError(`manifest ref name is invalid for ${repo}`, 1)
  }
  if (typeof raw.oid !== 'string' || !/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(raw.oid)) {
    throw new AppError(`manifest oid is invalid for ${repo}`, 1)
  }
  return { name: raw.name, oid: raw.oid }
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value)
}
