import assert from 'node:assert/strict'
import { test } from 'node:test'
import { githubClient, nextLink } from '../src/github.ts'

test('next link is read from the GitHub header', () => {
  assert.equal(nextLink('<https://api.github.com/user/repos?page=2>; rel="next"'), 'https://api.github.com/user/repos?page=2')
  assert.equal(nextLink('<https://api.github.com/user/repos?page=1>; rel="prev"'), null)
  assert.equal(nextLink(null), null)
})

test('repo list keeps personal repos and follows every page', async () => {
  const urls: string[] = []
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input)
    urls.push(url)
    if (url.endsWith('/user')) return json({ login: 'kaiser', id: 7, name: 'Kaiser', created_at: '2020-01-01T00:00:00Z', public_repos: 2, followers: 1, following: 0 })
    if (url.includes('page=2')) {
      return json([repo('zeta', { login: 'kaiser', type: 'User' }, false)])
    }
    return json([
      repo('app', { login: 'kaiser', type: 'User' }, false),
      repo('forked', { login: 'kaiser', type: 'User' }, true),
      repo('org-tool', { login: 'acme', type: 'Organization' }, false),
      repo('shared', { login: 'ada', type: 'User' }, false),
    ], '<https://github.test/user/repos?affiliation=owner&per_page=100&page=2>; rel="next"')
  }
  const repos = await githubClient('token-value-123', fetchImpl, 'https://github.test').listPersonalRepos()
  assert.deepEqual(repos.map((item) => item.name), ['app', 'zeta'])
  assert.equal(urls.some((url) => url.includes('page=2')), true)
})

test('a broken second page fails the list', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/user')) return json({ login: 'kaiser', id: 7, name: 'Kaiser', created_at: '2020-01-01T00:00:00Z', public_repos: 1, followers: 0, following: 0 })
    if (url.includes('page=2')) return new Response('nope', { status: 500 })
    return json([repo('app', { login: 'kaiser', type: 'User' }, false)], '<https://github.test/user/repos?page=2>; rel="next"')
  }
  await assert.rejects(() => githubClient('token-value-123', fetchImpl, 'https://github.test').listPersonalRepos(), /GitHub 500/)
})

test('open source pull requests exclude the user and count merges separately', async () => {
  const queries: string[] = []
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input))
    const query = url.searchParams.get('q') ?? ''
    queries.push(query)
    if (query.includes('is:merged')) {
      return json({ total_count: 1, incomplete_results: false, items: [] })
    }
    return json({
      total_count: 2,
      incomplete_results: false,
      items: [
        pr('other/lib', 1, true),
        pr('kaiser/dotfiles', 3, true),
      ],
    })
  }
  const activity = await githubClient('token-value-123', fetchImpl, 'https://github.test').openSourceActivity('kaiser')
  assert.equal(queries.length, 2)
  assert.match(queries[0], /author:kaiser/)
  assert.match(queries[0], /-user:kaiser/)
  assert.doesNotMatch(queries[0], /is:merged/)
  assert.match(queries[1], /is:merged/)
  assert.match(queries[1], /-user:kaiser/)
  assert.equal(activity.contributionCount, 2)
  assert.equal(activity.mergedCount, 1)
  assert.deepEqual(activity.items.map((item) => item.repo), ['other/lib', 'kaiser/dotfiles'])
})

function json(body: unknown, link?: string): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: link ? { link } : {} })
}

test('filters keep each source you tick and the first source wins', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input)
    if (url.includes('affiliation=owner')) {
      return json([
        repo('app', { login: 'kaiser', type: 'User' }, false, 1),
        repo('forked', { login: 'kaiser', type: 'User' }, true, 2),
      ])
    }
    if (url.includes('organization_member')) return json([repo('org-tool', { login: 'acme', type: 'Organization' }, false, 3)])
    if (url.includes('affiliation=collaborator')) return json([repo('shared', { login: 'ada', type: 'User' }, false, 4)])
    if (url.includes('/user/starred')) {
      return json([
        repo('app', { login: 'kaiser', type: 'User' }, false, 1),
        repo('leftpad', { login: 'other', type: 'User' }, false, 5),
      ])
    }
    return json([])
  }
  const client = githubClient('token-value-123', fetchImpl, 'https://github.test')
  const ownedOnly = await client.listRepos({ owned: true, organization: false, starred: false, forked: false, collaborator: false })
  assert.deepEqual(ownedOnly.map((item) => item.fullName), ['kaiser/app'])
  const all = await client.listRepos({ owned: true, organization: true, starred: true, forked: true, collaborator: true })
  assert.deepEqual(all.map((item) => `${item.source}:${item.fullName}`), [
    'org:acme/org-tool',
    'collaborator:ada/shared',
    'owned:kaiser/app',
    'forked:kaiser/forked',
    'starred:other/leftpad',
  ])
})

function repo(name: string, owner: { login: string, type: string }, fork: boolean, id = name.length) {
  return {
    id,
    name,
    full_name: `${owner.login}/${name}`,
    fork,
    private: false,
    clone_url: `https://github.com/${owner.login}/${name}.git`,
    description: null,
    language: 'TypeScript',
    default_branch: 'main',
    created_at: '2020-01-01T00:00:00Z',
    pushed_at: '2020-01-02T00:00:00Z',
    owner,
  }
}

function pr(repoName: string, number: number, merged: boolean) {
  const [owner, name] = repoName.split('/')
  return {
    number,
    title: 'change',
    state: merged ? 'closed' : 'open',
    html_url: `https://github.com/${repoName}/pull/${number}`,
    created_at: '2020-01-01T00:00:00Z',
    repository_url: `https://api.github.com/repos/${owner}/${name}`,
    pull_request: { merged_at: merged ? '2020-01-02T00:00:00Z' : null },
  }
}
