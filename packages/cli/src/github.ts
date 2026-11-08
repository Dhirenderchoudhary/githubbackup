import { AppError, isPersonalRepo, type PullRequest } from './domain.ts'

// ponytail: five search pages, 500 pull requests. Fetch further pages until Link rel="next" is gone when a history exceeds that.
const PR_PAGE_CAP = 5

export interface Profile {
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
  publicRepos: number
  followers: number
  following: number
}

export interface RemoteRepo {
  id: number
  name: string
  fullName: string
  cloneUrl: string
  private: boolean
  description: string | null
  language: string | null
  defaultBranch: string | null
  createdAt: string
  pushedAt: string
  fork: boolean
  ownerLogin: string
  ownerType: string
}

export interface RepoFilters {
  owned: boolean
  organization: boolean
  starred: boolean
  forked: boolean
  collaborator: boolean
}

export type RepoSource = 'owned' | 'org' | 'starred' | 'forked' | 'collaborator'

export interface ListedRepo extends RemoteRepo {
  source: RepoSource
}

export interface OpenSourceActivity {
  contributionCount: number
  mergedCount: number
  truncated: boolean
  items: PullRequest[]
}

export interface Github {
  profile(): Promise<Profile>
  listPersonalRepos(): Promise<RemoteRepo[]>
  listRepos(filters: RepoFilters): Promise<ListedRepo[]>
  openSourceActivity(login: string): Promise<OpenSourceActivity>
}

export function githubClient(token: string, fetchImpl: typeof fetch = fetch, apiBase = 'https://api.github.com'): Github {
  return {
    profile: () => getJson(`${apiBase}/user`, token, fetchImpl).then(parseProfile),
    listPersonalRepos: async () => {
      const profile = await getJson(`${apiBase}/user`, token, fetchImpl).then(parseProfile)
      const repos = await listAffiliation(`${apiBase}/user/repos?affiliation=owner&per_page=100`, token, fetchImpl)
      const personal = repos.filter((repo) => isPersonalRepo(repo, profile.login))
      const names = personal.map((repo) => repo.name)
      if (new Set(names).size !== names.length) throw new AppError('GitHub returned two repos with the same name', 1)
      return personal.sort((a, b) => a.name.localeCompare(b.name))
    },
    listRepos: async (filters) => {
      const chosen = new Map<number, ListedRepo>()
      const remember = (repo: RemoteRepo, source: RepoSource) => {
        if (!chosen.has(repo.id)) chosen.set(repo.id, { ...repo, source })
      }
      if (filters.owned || filters.forked) {
        const owned = await listAffiliation(`${apiBase}/user/repos?affiliation=owner&per_page=100`, token, fetchImpl)
        for (const repo of owned) {
          if (filters.owned && !repo.fork) remember(repo, 'owned')
          if (filters.forked && repo.fork) remember(repo, 'forked')
        }
      }
      if (filters.organization) {
        const orgs = await listAffiliation(`${apiBase}/user/repos?affiliation=organization_member&per_page=100`, token, fetchImpl)
        for (const repo of orgs) {
          if (repo.ownerType === 'Organization') remember(repo, 'org')
        }
      }
      if (filters.collaborator) {
        const shared = await listAffiliation(`${apiBase}/user/repos?affiliation=collaborator&per_page=100`, token, fetchImpl)
        for (const repo of shared) remember(repo, 'collaborator')
      }
      if (filters.starred) {
        const starred = await listAffiliation(`${apiBase}/user/starred?per_page=100`, token, fetchImpl)
        for (const repo of starred) remember(repo, 'starred')
      }
      return [...chosen.values()].sort((a, b) => a.fullName.localeCompare(b.fullName))
    },
    openSourceActivity: (login) => openSourceActivity(apiBase, token, login, fetchImpl),
  }
}

export function nextLink(header: string | null): string | null {
  if (!header) return null
  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/)
    if (match) return match[1]
  }
  return null
}

async function openSourceActivity(apiBase: string, token: string, login: string, fetchImpl: typeof fetch): Promise<OpenSourceActivity> {
  const listed = await searchIssues(apiBase, token, fetchImpl, `author:${login} type:pr is:public -user:${login}`, true)
  const merged = await searchIssues(apiBase, token, fetchImpl, `author:${login} type:pr is:public is:merged -user:${login}`, false)
  return {
    contributionCount: listed.totalCount,
    mergedCount: merged.totalCount,
    truncated: listed.truncated,
    items: listed.items,
  }
}

async function searchIssues(apiBase: string, token: string, fetchImpl: typeof fetch, query: string, followPages: boolean): Promise<{
  totalCount: number
  truncated: boolean
  items: PullRequest[]
}> {
  let next: string | null = `${apiBase}/search/issues?q=${encodeURIComponent(query)}&per_page=${followPages ? 100 : 1}`
  const items: PullRequest[] = []
  let totalCount = 0
  let truncated = false
  let pages = 0
  while (next && pages < (followPages ? PR_PAGE_CAP : 1)) {
    pages += 1
    const response = await request(next, token, fetchImpl)
    const body = await response.json() as Record<string, unknown>
    if (typeof body.total_count !== 'number') throw new AppError('GitHub pull request search had no total_count', 1)
    totalCount = body.total_count
    if (body.incomplete_results === true) truncated = true
    if (!Array.isArray(body.items)) throw new AppError('GitHub pull request search had no items', 1)
    if (followPages) {
      for (const item of body.items) items.push(parsePullRequest(item))
    }
    next = nextLink(response.headers.get('link'))
  }
  if (followPages && (next || items.length < totalCount)) truncated = true
  return { totalCount, truncated, items }
}

async function listAffiliation(url: string, token: string, fetchImpl: typeof fetch): Promise<RemoteRepo[]> {
  const pages = await paginate(url, token, fetchImpl)
  const repos: RemoteRepo[] = []
  for (const page of pages) {
    if (!Array.isArray(page)) throw new AppError('GitHub repo page was not a list', 1)
    for (const item of page) repos.push(parseRepo(item))
  }
  return repos
}

async function paginate(url: string, token: string, fetchImpl: typeof fetch): Promise<unknown[]> {
  const pages: unknown[] = []
  const seen = new Set<string>()
  let next: string | null = url
  while (next) {
    if (seen.has(next)) throw new AppError('GitHub pagination repeated a page', 1)
    seen.add(next)
    const response = await request(next, token, fetchImpl)
    pages.push(await response.json())
    next = nextLink(response.headers.get('link'))
  }
  return pages
}

async function getJson(url: string, token: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await request(url, token, fetchImpl)
  return response.json()
}

async function request(url: string, token: string, fetchImpl: typeof fetch): Promise<Response> {
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'gitbackup',
    },
  })
  if (!response.ok) throw new AppError(`GitHub ${response.status} for ${stripQuery(url)}`, 1)
  return response
}

function stripQuery(url: string): string {
  const parsed = new URL(url)
  return `${parsed.origin}${parsed.pathname}`
}

function parseProfile(value: unknown): Profile {
  const raw = object(value, 'GitHub user')
  return {
    login: requiredString(raw, 'login', 'GitHub user'),
    id: requiredNumber(raw, 'id', 'GitHub user'),
    name: optionalString(raw, 'name'),
    bio: optionalString(raw, 'bio'),
    company: optionalString(raw, 'company'),
    location: optionalString(raw, 'location'),
    blog: optionalString(raw, 'blog'),
    twitter: optionalString(raw, 'twitter_username'),
    htmlUrl: optionalString(raw, 'html_url'),
    createdAt: requiredString(raw, 'created_at', 'GitHub user'),
    publicRepos: requiredNumber(raw, 'public_repos', 'GitHub user'),
    followers: requiredNumber(raw, 'followers', 'GitHub user'),
    following: requiredNumber(raw, 'following', 'GitHub user'),
  }
}

function parseRepo(value: unknown): RemoteRepo {
  const raw = object(value, 'GitHub repo')
  const owner = object(raw.owner, 'GitHub repo owner')
  const cloneUrl = new URL(requiredString(raw, 'clone_url', 'GitHub repo'))
  cloneUrl.username = ''
  cloneUrl.password = ''
  return {
    id: requiredNumber(raw, 'id', 'GitHub repo'),
    name: requiredString(raw, 'name', 'GitHub repo'),
    fullName: requiredString(raw, 'full_name', 'GitHub repo'),
    cloneUrl: cloneUrl.toString(),
    private: requiredBoolean(raw, 'private', 'GitHub repo'),
    description: optionalString(raw, 'description'),
    language: optionalString(raw, 'language'),
    defaultBranch: optionalString(raw, 'default_branch'),
    createdAt: requiredString(raw, 'created_at', 'GitHub repo'),
    pushedAt: requiredString(raw, 'pushed_at', 'GitHub repo'),
    fork: requiredBoolean(raw, 'fork', 'GitHub repo'),
    ownerLogin: requiredString(owner, 'login', 'GitHub repo owner'),
    ownerType: requiredString(owner, 'type', 'GitHub repo owner'),
  }
}

function parsePullRequest(value: unknown): PullRequest {
  const raw = object(value, 'GitHub pull request')
  const repositoryUrl = requiredString(raw, 'repository_url', 'GitHub pull request')
  const parts = new URL(repositoryUrl).pathname.split('/').filter(Boolean)
  if (parts.length < 3 || parts[0] !== 'repos') throw new AppError('GitHub pull request repository_url was not a repo', 1)
  const pull = raw.pull_request
  const merged = Boolean(pull && typeof pull === 'object' && (pull as { merged_at?: unknown }).merged_at)
  return {
    repo: `${parts[1]}/${parts[2]}`,
    number: requiredNumber(raw, 'number', 'GitHub pull request'),
    title: requiredString(raw, 'title', 'GitHub pull request'),
    state: requiredString(raw, 'state', 'GitHub pull request'),
    createdAt: requiredString(raw, 'created_at', 'GitHub pull request'),
    url: requiredString(raw, 'html_url', 'GitHub pull request'),
    merged,
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new AppError(`${label} was not an object`, 1)
  return value as Record<string, unknown>
}

function requiredString(raw: Record<string, unknown>, key: string, label: string): string {
  const value = raw[key]
  if (typeof value !== 'string' || value === '') throw new AppError(`${label} ${key} is missing`, 1)
  return value
}

function requiredNumber(raw: Record<string, unknown>, key: string, label: string): number {
  const value = raw[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new AppError(`${label} ${key} is missing`, 1)
  return value
}

function requiredBoolean(raw: Record<string, unknown>, key: string, label: string): boolean {
  const value = raw[key]
  if (typeof value !== 'boolean') throw new AppError(`${label} ${key} is missing`, 1)
  return value
}

function optionalString(raw: Record<string, unknown>, key: string): string | null {
  const value = raw[key]
  if (value == null) return null
  if (typeof value !== 'string') throw new AppError(`GitHub ${key} was not a string`, 1)
  return value
}
