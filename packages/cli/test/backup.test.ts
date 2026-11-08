import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBucketPublisher } from '../src/bucket.ts'
import { backup, chooseRepos, formatReport } from '../src/backup.ts'
import type { UserDetails } from '../src/domain.ts'
import { createDrivePublisher, type DriveApi } from '../src/drive.ts'
import type { Github, OpenSourceActivity, Profile, RemoteRepo } from '../src/github.ts'
import { git, listRefs } from '../src/mirror.ts'
import type { ObjectClient } from '../src/object-client.ts'
import { unzipSnapshot } from '../src/pack.ts'

const profile: Profile = {
  login: 'kaiser',
  id: 7,
  name: 'Kaiser',
  bio: 'building',
  company: null,
  location: null,
  blog: null,
  twitter: null,
  htmlUrl: 'https://github.com/kaiser',
  createdAt: '2020-01-01T00:00:00Z',
  publicRepos: 1,
  followers: 0,
  following: 0,
}

const author = {
  GIT_AUTHOR_NAME: 'Kaiser',
  GIT_AUTHOR_EMAIL: '7+kaiser@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'Kaiser',
  GIT_COMMITTER_EMAIL: '7+kaiser@users.noreply.github.com',
}

test.before(async () => {
  await mkdir(join(process.cwd(), '.tmp'), { recursive: true })
})

test('a backup restores personal repo history and records contributions', async () => {
  const root = await mkdtemp(join(process.cwd(), '.tmp', 'backup-'))
  const origin = join(root, 'origin')
  const empty = join(root, 'empty')
  await makeHistory(origin)
  await mkdir(empty, { recursive: true })
  await git(['init', '-b', 'main'], { cwd: empty })
  const activity = openSource()
  const store = memoryObjects()
  const destination = createBucketPublisher(store.client, { kind: 's3', prefix: 'gitbackup', workDir: join(root, 'work') })
  const github = fakeGithub([
    remote('app', origin),
    remote('blank', empty),
  ], activity)

  const result = await backup({
    github,
    destination,
    cacheDir: join(root, 'cache'),
    token: 'ghp_THIS_IS_THE_TOKEN_VALUE',
    now: () => '2026-11-05T00:00:00.000Z',
    lfsAvailable: false,
  })
  assert.equal(formatReport(result), [
    'personal repos 2',
    'commits 4',
    'open source contributions 2',
    'merged pull requests 1',
    'destination s3',
    'published',
  ].join('\n'))

  const manifestBytes = store.bodies.get('gitbackup/manifest.json')
  assert.ok(manifestBytes)
  const manifest = JSON.parse(manifestBytes.body.toString('utf8')) as { detailsKey: string, repos: { name: string }[] }
  const details = JSON.parse(store.bodies.get(manifest.detailsKey)!.body.toString('utf8')) as UserDetails
  assert.equal(details.repoCount, 2)
  assert.equal(details.commitCount, 4)
  assert.equal(details.openSourceContributionCount, 2)
  assert.equal(details.mergedPullRequestCount, 1)
  assert.deepEqual(details.contributedRepos, ['other/lib', 'vercel/next.js'])
  assert.equal(details.openSourcePullRequests.items.some((item) => item.repo.startsWith('kaiser/')), false)
  assert.equal(details.repos.find((repo) => repo.name === 'app')?.commitCount, 4)
  assert.equal(details.repos.find((repo) => repo.name === 'blank')?.commitCount, 0)

  const out = join(root, 'restored')
  await destination.restore(out)
  const restoredRefs = await listRefs(join(out, 'app.git'))
  const originRefs = await listRefs(origin)
  assert.deepEqual(restoredRefs, originRefs.filter((ref) => !ref.name.startsWith('refs/remotes/')))
  const count = Number((await git(['rev-list', '--all', '--count'], { cwd: join(out, 'app.git') })).trim())
  assert.equal(count, 5)
  const work = join(root, 'worktree')
  await git(['clone', join(out, 'app.git'), work])
  assert.equal(await readFile(join(work, 'hello.txt'), 'utf8'), 'hello backup\nsecond\n')
  await git(['checkout', 'feat/ü-weird'], { cwd: work })
  assert.equal(await readFile(join(work, 'only-on-branch.txt'), 'utf8'), 'branch-only\n')
  assert.equal((await git(['notes', 'show', 'HEAD'], { cwd: origin })).trim(), 'ship it')
  assert.equal(await treeContains(join(root, 'cache'), 'ghp_THIS_IS_THE_TOKEN_VALUE'), false)
  assert.equal(await treeContains(out, 'ghp_THIS_IS_THE_TOKEN_VALUE'), false)

  const putsAfterFirst = store.puts.length
  const again = await backup({
    github,
    destination,
    cacheDir: join(root, 'cache'),
    token: 'ghp_THIS_IS_THE_TOKEN_VALUE',
    now: () => '2026-11-05T00:00:00.000Z',
    lfsAvailable: false,
  })
  assert.equal(again.status, 'unchanged')
  assert.equal(store.puts.length, putsAfterFirst)

  activity.items.push({
    repo: 'nodejs/node',
    number: 9,
    title: 'patch',
    state: 'closed',
    createdAt: '2020-02-01T00:00:00Z',
    url: 'https://github.com/nodejs/node/pull/9',
    merged: true,
  })
  const updated = await backup({
    github,
    destination,
    cacheDir: join(root, 'cache'),
    token: 'ghp_THIS_IS_THE_TOKEN_VALUE',
    now: () => '2026-11-05T01:00:00.000Z',
    lfsAvailable: false,
  })
  assert.equal(updated.openSourceContributionCount, 3)
  assert.equal(updated.mergedPullRequestCount, 2)
  assert.equal(store.puts.length, putsAfterFirst + 2)
  assert.equal(store.puts.slice(putsAfterFirst).some((key) => key.includes('/repos/')), false)
})

test('a crash while publishing the manifest keeps the previous backup', async () => {
  const root = await mkdtemp(join(process.cwd(), '.tmp', 'crash-'))
  const origin = join(root, 'origin')
  await makeHistory(origin)
  const store = memoryObjects()
  const destination = createBucketPublisher(store.client, { kind: 's3', prefix: 'gitbackup', workDir: join(root, 'work') })
  const github = fakeGithub([remote('app', origin)], openSource())
  await backup({ github, destination, cacheDir: join(root, 'cache'), token: 'ghp_THIS_IS_THE_TOKEN_VALUE', now: () => '2026-11-05T00:00:00.000Z', lfsAvailable: false })
  const before = Buffer.from(store.bodies.get('gitbackup/manifest.json')!.body)
  await writeFile(join(origin, 'hello.txt'), 'hello backup\nsecond\nmore\n')
  await git(['commit', '-am', 'more'], { cwd: origin, env: author })
  store.lieAboutManifestReadback = true
  await assert.rejects(() => backup({
    github,
    destination,
    cacheDir: join(root, 'cache'),
    token: 'ghp_THIS_IS_THE_TOKEN_VALUE',
    now: () => '2026-11-05T02:00:00.000Z',
    lfsAvailable: false,
  }), /readback mismatch/)
  assert.equal(store.bodies.get('gitbackup/manifest.json')!.body.equals(before), true)
})

test('a smaller repo list does not replace the manifest', async () => {
  const root = await mkdtemp(join(process.cwd(), '.tmp', 'shrink-'))
  const origin = join(root, 'origin')
  const other = join(root, 'other')
  await makeHistory(origin)
  await mkdir(other, { recursive: true })
  await git(['init', '-b', 'main'], { cwd: other })
  await writeFile(join(other, 'a.txt'), 'a\n')
  await git(['add', 'a.txt'], { cwd: other })
  await git(['commit', '-m', 'a'], { cwd: other, env: author })
  const store = memoryObjects()
  const destination = createBucketPublisher(store.client, { kind: 'r2', prefix: 'gitbackup', workDir: join(root, 'work') })
  const repos = [remote('app', origin), remote('notes', other)]
  const github = fakeGithub(repos, openSource())
  await backup({ github, destination, cacheDir: join(root, 'cache'), token: 'ghp_THIS_IS_THE_TOKEN_VALUE', now: () => '2026-11-05T00:00:00.000Z', lfsAvailable: false })
  const before = Buffer.from(store.bodies.get('gitbackup/manifest.json')!.body)
  repos.pop()
  await assert.rejects(() => backup({
    github,
    destination,
    cacheDir: join(root, 'cache2'),
    token: 'ghp_THIS_IS_THE_TOKEN_VALUE',
    now: () => '2026-11-05T03:00:00.000Z',
    lfsAvailable: false,
  }), /refusing to drop notes/)
  assert.equal(store.bodies.get('gitbackup/manifest.json')!.body.equals(before), true)
})

test('git lfs without git-lfs publishes nothing', async () => {
  const root = await mkdtemp(join(process.cwd(), '.tmp', 'lfs-'))
  const origin = join(root, 'origin')
  await mkdir(origin, { recursive: true })
  await git(['init', '-b', 'main'], { cwd: origin })
  await writeFile(join(origin, '.gitattributes'), '*.bin filter=lfs diff=lfs merge=lfs -text\n')
  await writeFile(join(origin, 'blob.bin'), 'version https://git-lfs.github.com/spec/v1\noid sha256:abcd\nsize 1\n')
  await git(['add', '.'], { cwd: origin })
  await git(['commit', '-m', 'lfs'], { cwd: origin, env: author })
  const store = memoryObjects()
  const destination = createBucketPublisher(store.client, { kind: 's3', prefix: 'gitbackup', workDir: join(root, 'work') })
  await assert.rejects(() => backup({
    github: fakeGithub([remote('assets', origin)], openSource()),
    destination,
    cacheDir: join(root, 'cache'),
    token: 'ghp_THIS_IS_THE_TOKEN_VALUE',
    lfsAvailable: false,
  }), /git-lfs is not installed/)
  assert.equal(store.bodies.has('gitbackup/manifest.json'), false)
})

test('drive stores one zip and does not upload a second zip when only contributions change', async () => {
  const root = await mkdtemp(join(process.cwd(), '.tmp', 'drive-'))
  const origin = join(root, 'origin')
  await makeHistory(origin)
  const activity = openSource()
  const drive = memoryDrive()
  const destination = createDrivePublisher(drive.api, join(root, 'work'))
  const github = fakeGithub([remote('app', origin)], activity)
  const result = await backup({
    github,
    destination,
    cacheDir: join(root, 'cache'),
    token: 'ghp_THIS_IS_THE_TOKEN_VALUE',
    now: () => '2026-11-05T00:00:00.000Z',
    lfsAvailable: false,
  })
  assert.equal(result.destination, 'drive')
  assert.equal(drive.created.filter((name) => name.endsWith('.zip')).length, 1)
  const zip = [...drive.byId.values()].find((file) => file.name.endsWith('.zip'))
  assert.ok(zip)
  const extracted = join(root, 'zip')
  await writeFile(join(root, 'snapshot.zip'), zip.body)
  await unzipSnapshot(join(root, 'snapshot.zip'), extracted)
  const names = await walk(extracted)
  assert.equal(names.some((name) => name.startsWith('repos/app.git/')), true)
  const details = JSON.parse(await readFile(join(extracted, 'details.json'), 'utf8')) as UserDetails
  assert.equal(details.commitCount, 4)
  assert.equal(details.openSourceContributionCount, 2)
  assert.deepEqual(details.contributedRepos, ['other/lib', 'vercel/next.js'])

  const out = join(root, 'restored')
  await destination.restore(out)
  assert.equal(await readFile(join(out, 'details.json'), 'utf8'), JSON.stringify(details))
  const work = join(root, 'worktree')
  await git(['clone', join(out, 'app.git'), work])
  assert.equal(await readFile(join(work, 'hello.txt'), 'utf8'), 'hello backup\nsecond\n')

  const zips = drive.created.filter((name) => name.endsWith('.zip')).length
  activity.items.push({
    repo: 'nodejs/node',
    number: 9,
    title: 'patch',
    state: 'closed',
    createdAt: '2020-02-01T00:00:00Z',
    url: 'https://github.com/nodejs/node/pull/9',
    merged: true,
  })
  await backup({
    github,
    destination,
    cacheDir: join(root, 'cache'),
    token: 'ghp_THIS_IS_THE_TOKEN_VALUE',
    now: () => '2026-11-05T04:00:00.000Z',
    lfsAvailable: false,
  })
  assert.equal(drive.created.filter((name) => name.endsWith('.zip')).length, zips)
  const restoredDetails = JSON.parse(await readFile(join(root, 'restored-2', 'details.json'), 'utf8').catch(async () => {
    await destination.restore(join(root, 'restored-2'))
    return readFile(join(root, 'restored-2', 'details.json'), 'utf8')
  })) as UserDetails
  assert.equal(restoredDetails.openSourceContributionCount, 3)
  assert.equal(restoredDetails.mergedPullRequestCount, 2)
})

async function makeHistory(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await git(['init', '-b', 'main'], { cwd: dir })
  await writeFile(join(dir, 'hello.txt'), 'hello backup\n')
  await git(['add', 'hello.txt'], { cwd: dir })
  await git(['commit', '-m', 'init'], { cwd: dir, env: author })
  await writeFile(join(dir, 'hello.txt'), 'hello backup\nsecond\n')
  await git(['commit', '-am', 'second'], { cwd: dir, env: author })
  await git(['checkout', '-b', 'other-author'], { cwd: dir })
  await writeFile(join(dir, 'hello.txt'), 'hello backup\nsecond\nother\n')
  await git(['commit', '-am', 'other'], {
    cwd: dir,
    env: {
      GIT_AUTHOR_NAME: 'Ada',
      GIT_AUTHOR_EMAIL: 'ada@example.com',
      GIT_COMMITTER_NAME: 'Ada',
      GIT_COMMITTER_EMAIL: 'ada@example.com',
    },
  })
  await git(['checkout', 'main'], { cwd: dir })
  await git(['checkout', '-b', 'feat/ü-weird'], { cwd: dir })
  await writeFile(join(dir, 'only-on-branch.txt'), 'branch-only\n')
  await git(['add', 'only-on-branch.txt'], { cwd: dir })
  await git(['commit', '-m', 'branch'], { cwd: dir, env: author })
  await git(['checkout', 'main'], { cwd: dir })
  await git(['tag', '-a', 'v1', '-m', 'v1'], { cwd: dir, env: author })
  await git(['notes', 'add', '-m', 'ship it'], { cwd: dir, env: author })
}

test('a fork and an organization repo get their own archive names', () => {
  const owned = remote('app', 'https://example.test/app.git')
  const fork = { ...owned, id: 9, cloneUrl: 'https://example.test/fork.git', fork: true }
  const org = { ...remote('tool', 'https://example.test/tool.git'), id: 10, fullName: 'acme/tool', ownerLogin: 'acme', ownerType: 'Organization' }
  assert.deepEqual(chooseRepos([owned, fork, org], 'kaiser', undefined, true).map((job) => job.key), ['acme__tool', 'app', 'kaiser__app'])
  assert.throws(() => chooseRepos([owned], 'kaiser', ['other/missing'], true), /not in the current filters/)
})

function remote(name: string, cloneUrl: string): RemoteRepo {
  return {
    id: name.length,
    name,
    fullName: `kaiser/${name}`,
    cloneUrl,
    private: false,
    description: `${name} repo`,
    language: 'TypeScript',
    defaultBranch: 'main',
    createdAt: '2020-01-01T00:00:00Z',
    pushedAt: '2020-01-02T00:00:00Z',
    fork: false,
    ownerLogin: 'kaiser',
    ownerType: 'User',
  }
}

function openSource(): OpenSourceActivity {
  return {
    contributionCount: 2,
    mergedCount: 1,
    truncated: false,
    items: [
      { repo: 'other/lib', number: 1, title: 'fix', state: 'closed', createdAt: '2020-01-01T00:00:00Z', url: 'https://github.com/other/lib/pull/1', merged: true },
      { repo: 'vercel/next.js', number: 2, title: 'add', state: 'open', createdAt: '2020-01-02T00:00:00Z', url: 'https://github.com/vercel/next.js/pull/2', merged: false },
      { repo: 'kaiser/dotfiles', number: 3, title: 'mine', state: 'closed', createdAt: '2020-01-03T00:00:00Z', url: 'https://github.com/kaiser/dotfiles/pull/3', merged: true },
    ],
  }
}

function fakeGithub(repos: RemoteRepo[], activity: OpenSourceActivity): Github {
  return {
    profile: async () => profile,
    listPersonalRepos: async () => repos.filter((repo) => repo.fork === false && repo.ownerLogin === profile.login && repo.ownerType === 'User'),
    listRepos: async () => [],
    openSourceActivity: async () => activity,
  }
}

function memoryObjects(): { client: ObjectClient, bodies: Map<string, { body: Buffer, sha256: string }>, puts: string[], lieAboutManifestReadback: boolean } {
  const bodies = new Map<string, { body: Buffer, sha256: string }>()
  const puts: string[] = []
  const state = { lieAboutManifestReadback: false, corruptNextManifestRead: false }
  const client: ObjectClient = {
    async putFile(key, filePath, sha256) {
      puts.push(key)
      bodies.set(key, { body: await readFile(filePath), sha256 })
    },
    async putBytes(key, body, sha256) {
      puts.push(key)
      bodies.set(key, { body: Buffer.from(body), sha256 })
      if (state.lieAboutManifestReadback && key.endsWith('manifest.json')) state.corruptNextManifestRead = true
    },
    async head(key) {
      const hit = bodies.get(key)
      if (!hit) return null
      return { bytes: hit.body.length, sha256: hit.sha256 }
    },
    async getBytes(key) {
      const hit = bodies.get(key)
      if (!hit) return null
      if (state.corruptNextManifestRead && key.endsWith('manifest.json')) {
        state.corruptNextManifestRead = false
        return Buffer.from('nope')
      }
      return Buffer.from(hit.body)
    },
    async download(key, dest) {
      const hit = bodies.get(key)
      if (!hit) throw new Error(`missing ${key}`)
      await mkdir(join(dest, '..'), { recursive: true }).catch(() => undefined)
      await writeFile(dest, hit.body)
    },
  }
  return {
    client,
    bodies,
    puts,
    get lieAboutManifestReadback() { return state.lieAboutManifestReadback },
    set lieAboutManifestReadback(value: boolean) {
      state.lieAboutManifestReadback = value
      state.corruptNextManifestRead = false
    },
  }
}

function memoryDrive(): { api: DriveApi, created: string[], byId: Map<string, { name: string, body: Buffer }> } {
  let seq = 1
  const byId = new Map<string, { name: string, body: Buffer }>()
  const names = new Map<string, string>()
  const created: string[] = []
  const api: DriveApi = {
    async find(name) {
      const id = names.get(name)
      return id ? { id } : null
    },
    async create(name, body) {
      const id = `id-${seq}`
      seq += 1
      byId.set(id, { name, body: Buffer.from(body) })
      names.set(name, id)
      created.push(name)
      return { id }
    },
    async replace(id, body) {
      const existing = byId.get(id)
      if (!existing) throw new Error(`missing ${id}`)
      existing.body = Buffer.from(body)
    },
    async download(id) {
      const existing = byId.get(id)
      if (!existing) throw new Error(`missing ${id}`)
      return Buffer.from(existing.body)
    },
  }
  return { api, created, byId }
}

async function treeContains(dir: string, needle: string): Promise<boolean> {
  const entries = await readdir(dir, { withFileTypes: true })
  const target = Buffer.from(needle)
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (await treeContains(path, needle)) return true
    } else if (entry.isFile()) {
      if ((await readFile(path)).includes(target)) return true
    }
  }
  return false
}

async function walk(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const names: string[] = []
  for (const entry of entries) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) names.push(...await walk(join(dir, entry.name), name))
    else names.push(name)
  }
  return names
}
