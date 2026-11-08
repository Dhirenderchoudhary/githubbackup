import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertSafeRelative,
  authoredByUser,
  isPersonalRepo,
  redact,
  summarizeContributions,
} from '../src/domain.ts'

test('personal repos are the ones this user created', () => {
  const login = 'Kaiser'
  assert.equal(isPersonalRepo({ name: 'app', fork: false, ownerLogin: 'kaiser', ownerType: 'User' }, login), true)
  assert.equal(isPersonalRepo({ name: 'forked', fork: true, ownerLogin: 'kaiser', ownerType: 'User' }, login), false)
  assert.equal(isPersonalRepo({ name: 'org', fork: false, ownerLogin: 'acme', ownerType: 'Organization' }, login), false)
  assert.equal(isPersonalRepo({ name: 'shared', fork: false, ownerLogin: 'ada', ownerType: 'User' }, login), false)
})

test('open source contributions exclude pull requests to your own repos', () => {
  const summary = summarizeContributions([
    { repo: 'other/lib', number: 1, title: 'fix', state: 'closed', createdAt: '2020-01-01T00:00:00Z', url: 'https://github.com/other/lib/pull/1', merged: true },
    { repo: 'vercel/next.js', number: 2, title: 'add', state: 'open', createdAt: '2020-01-02T00:00:00Z', url: 'https://github.com/vercel/next.js/pull/2', merged: false },
    { repo: 'kaiser/dotfiles', number: 3, title: 'mine', state: 'closed', createdAt: '2020-01-03T00:00:00Z', url: 'https://github.com/kaiser/dotfiles/pull/3', merged: true },
  ], 'kaiser', { contributionCount: 99, mergedCount: 99, truncated: false })
  assert.equal(summary.openSourceContributionCount, 2)
  assert.equal(summary.mergedPullRequestCount, 1)
  assert.deepEqual(summary.contributedRepos, ['other/lib', 'vercel/next.js'])
  assert.deepEqual(summary.pullRequests.map((item) => item.repo), ['other/lib', 'vercel/next.js'])
})

test('a truncated search keeps the GitHub totals', () => {
  const summary = summarizeContributions([
    { repo: 'other/lib', number: 1, title: 'fix', state: 'closed', createdAt: '2020-01-01T00:00:00Z', url: 'https://github.com/other/lib/pull/1', merged: true },
  ], 'kaiser', { contributionCount: 40, mergedCount: 12, truncated: true })
  assert.equal(summary.openSourceContributionCount, 40)
  assert.equal(summary.mergedPullRequestCount, 12)
  assert.deepEqual(summary.contributedRepos, ['other/lib'])
})

test('authored commits match the GitHub user', () => {
  const user = { login: 'Kaiser', id: 7, name: 'Kaiser' }
  assert.equal(authoredByUser('7+kaiser@users.noreply.github.com', 'Someone', user), true)
  assert.equal(authoredByUser('kaiser@users.noreply.github.com', 'Someone', user), true)
  assert.equal(authoredByUser('k@example.com', 'Kaiser', user), true)
  assert.equal(authoredByUser('ada@example.com', 'Ada', user), false)
})

test('secrets are stripped from errors', () => {
  assert.equal(redact('token ghp_SUPERSECRET failed', ['ghp_SUPERSECRET']), 'token [redacted] failed')
})

test('paths cannot escape the archive', () => {
  assert.throws(() => assertSafeRelative('../evil'), /unsafe path/)
  assert.throws(() => assertSafeRelative('/etc/passwd'), /unsafe path/)
  assertSafeRelative('repos/app.git/HEAD')
})
