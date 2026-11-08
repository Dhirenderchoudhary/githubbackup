import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

test.before(async () => {
  await mkdir(join(process.cwd(), '.tmp'), { recursive: true })
})
import { loadDestination } from '../src/config.ts'
import { bucketClientOptions } from '../src/object-client.ts'
import { main, parseCommand } from '../src/cli.ts'

test('one chosen destination is the only destination', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.tmp', 'config-'))
  const file = join(dir, 'config.json')
  await writeFile(file, JSON.stringify({
    to: 'drive',
    s3: { bucket: 's3-bucket', region: 'us-east-1', endpoint: 'https://s3.example' },
    r2: { bucket: 'r2-bucket', accountId: 'abc123' },
    drive: { folderId: 'folder' },
  }))
  const resolved = await loadDestination(file, {
    GITHUB_TOKEN: 'github-token-value',
    R2_ACCESS_KEY_ID: 'r2-access-key',
    R2_SECRET_ACCESS_KEY: 'r2-secret-key',
  }, 'r2')
  assert.equal(resolved.kind, 'r2')
  assert.equal('refreshToken' in resolved, false)
  assert.equal('endpoint' in resolved, false)
  if (resolved.kind !== 'r2') return
  assert.equal(resolved.bucket, 'r2-bucket')
  assert.equal(resolved.accountId, 'abc123')
  assert.equal(resolved.accessKeyId, 'r2-access-key')
  assert.deepEqual(bucketClientOptions(resolved), {
    region: 'auto',
    endpoint: 'https://abc123.r2.cloudflarestorage.com',
    forcePathStyle: true,
  })
})

test('s3 with an endpoint uses path-style addressing', () => {
  assert.deepEqual(bucketClientOptions({
    kind: 's3',
    region: 'us-west-2',
    endpoint: 'https://s3.example',
  }), {
    region: 'us-west-2',
    endpoint: 'https://s3.example',
    forcePathStyle: true,
  })
})

test('environment values are enough when the config file is absent', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.tmp', 'env-'))
  const resolved = await loadDestination(join(dir, 'missing.json'), {
    GITHUB_TOKEN: 'github-token-value',
    GITBACKUP_TO: 's3',
    S3_BUCKET: 'env-bucket',
    AWS_REGION: 'eu-west-1',
    S3_PREFIX: 'mine',
    AWS_ACCESS_KEY_ID: 'aws-key',
    AWS_SECRET_ACCESS_KEY: 'aws-secret',
  }, null)
  assert.equal(resolved.kind, 's3')
  if (resolved.kind !== 's3') return
  assert.equal(resolved.bucket, 'env-bucket')
  assert.equal(resolved.region, 'eu-west-1')
  assert.equal(resolved.prefix, 'mine')
  assert.equal(resolved.endpoint, null)
})

test('repo filters default to owned and backup can name a selection', () => {
  const repos = parseCommand(['repos'])
  assert.equal(repos.kind, 'repos')
  if (repos.kind !== 'repos') return
  assert.equal(repos.filters.owned, true)
  assert.equal(repos.filters.forked, false)
  const backup = parseCommand(['backup', '--filters', 'owned,forked', '--select', 'kaiser/app,kaiser/forked', '--progress'])
  assert.equal(backup.kind, 'backup')
  if (backup.kind !== 'backup') return
  assert.equal(backup.filters?.forked, true)
  assert.deepEqual(backup.selected, ['kaiser/app', 'kaiser/forked'])
  assert.equal(backup.progress, true)
  const plain = parseCommand(['backup'])
  assert.equal(plain.kind, 'backup')
  if (plain.kind === 'backup') assert.equal(plain.filters, null)
})

test('the command rejects a missing destination', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.tmp', 'cli-'))
  const file = join(dir, 'config.json')
  await writeFile(file, '{}')
  const errors: string[] = []
  const code = await main(['backup', '--config', file], { GITHUB_TOKEN: 'github-token-value' }, {
    stdout: { write() {} },
    stderr: { write(chunk) { errors.push(chunk) } },
  })
  assert.equal(code, 2)
  assert.match(errors.join(''), /Choose one destination/)
})

test('check names the destination without backing anything up', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.tmp', 'cli-'))
  const file = join(dir, 'config.json')
  await writeFile(file, '{}')
  const out: string[] = []
  const env = { GITBACKUP_TO: 's3', S3_BUCKET: 'saves', AWS_ACCESS_KEY_ID: 'id', AWS_SECRET_ACCESS_KEY: 'secret' }
  const code = await main(['check', '--config', file], env, {
    stdout: { write(chunk) { out.push(chunk) } },
    stderr: { write() {} },
  })
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(out.join('')), { kind: 's3', where: 'saves/gitbackup' })
})

test('restore does not ask for a GitHub token', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.tmp', 'cli-'))
  const file = join(dir, 'config.json')
  await writeFile(file, '{}')
  const errors: string[] = []
  const env = { GITBACKUP_TO: 's3', S3_BUCKET: 'saves', AWS_ACCESS_KEY_ID: 'id', AWS_SECRET_ACCESS_KEY: 'secret' }
  const code = await main(['restore', '--config', file], env, {
    stdout: { write() {} },
    stderr: { write(chunk) { errors.push(chunk) } },
  })
  assert.equal(code, 2)
  assert.equal(errors.join(''), 'restore needs --out <directory>\n')
})
