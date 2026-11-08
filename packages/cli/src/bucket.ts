import { mkdtemp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  AppError,
  assertSafeRelative,
  parseManifest,
  repoStateOf,
  sha256Bytes,
  stableStringify,
  stateIdOf,
  type DestinationKind,
  type Manifest,
  type ManifestRepo,
  type UserDetails,
} from './domain.ts'
import { assertRefsMatch } from './mirror.ts'
import type { ObjectClient } from './object-client.ts'
import { extractTar, sha256File, tarDirectory, writeBytes } from './pack.ts'

export interface MirrorInput {
  name: string
  bareDir: string
  refs: { name: string, oid: string }[]
  commitCount: number
  empty: boolean
}

export interface PublishInput {
  createdAt: string
  details: UserDetails
  mirrors: MirrorInput[]
}

export interface SavedPointer {
  stateId: string
  repoNames: string[]
}

export interface Publisher {
  readonly kind: DestinationKind
  current(): Promise<SavedPointer | null>
  publish(input: PublishInput): Promise<'published' | 'unchanged'>
  restore(outDir: string): Promise<void>
}

export function createBucketPublisher(client: ObjectClient, opts: {
  kind: 's3' | 'r2'
  prefix: string
  workDir: string
}): Publisher {
  const manifestKey = objectKey(opts.prefix, 'manifest.json')
  return {
    kind: opts.kind,
    current: async () => {
      const bytes = await client.getBytes(manifestKey)
      if (!bytes) return null
      const manifest = parseManifest(JSON.parse(bytes.toString('utf8')))
      return { stateId: manifest.stateId, repoNames: manifest.repos.map((repo) => repo.name) }
    },
    publish: (input) => publishBucket(client, opts, manifestKey, input),
    restore: (outDir) => restoreBucket(client, manifestKey, outDir),
  }
}

async function publishBucket(
  client: ObjectClient,
  opts: { kind: 's3' | 'r2', prefix: string, workDir: string },
  manifestKey: string,
  input: PublishInput,
): Promise<'published' | 'unchanged'> {
  const previousBytes = await client.getBytes(manifestKey)
  const previous = previousBytes ? parseManifest(JSON.parse(previousBytes.toString('utf8'))) : null
  const detailsBody = Buffer.from(stableStringify(input.details))
  const detailsSha = sha256Bytes(detailsBody)
  const detailsKey = objectKey(opts.prefix, 'details', `${detailsSha}.json`)
  const stateId = stateIdOf(input.details.login, input.mirrors)
  const repos: ManifestRepo[] = []

  for (const mirror of [...input.mirrors].sort((a, b) => a.name.localeCompare(b.name))) {
    const archiveKey = objectKey(opts.prefix, 'repos', mirror.name, `${repoStateOf(mirror.refs)}.tar.gz`)
    const prior = previous?.repos.find((repo) => repo.name === mirror.name && repo.archiveKey === archiveKey)
    if (prior?.archiveSha256 && prior.archiveBytes != null) {
      const head = await client.head(archiveKey)
      if (head && head.sha256 === prior.archiveSha256 && head.bytes === prior.archiveBytes) {
        repos.push({ ...prior, commitCount: mirror.commitCount, empty: mirror.empty, refs: [...mirror.refs] })
        continue
      }
    }
    await mkdir(opts.workDir, { recursive: true })
    const dir = await mkdtemp(join(opts.workDir, 'tar-'))
    const tarPath = join(dir, `${mirror.name}.tar.gz`)
    await tarDirectory(mirror.bareDir, tarPath)
    const archiveSha256 = await sha256File(tarPath)
    const archiveBytes = (await stat(tarPath)).size
    await client.putFile(archiveKey, tarPath, archiveSha256)
    const checkPath = join(dir, 'readback.tar.gz')
    await client.download(archiveKey, checkPath)
    const got = await sha256File(checkPath)
    await rm(dir, { recursive: true, force: true })
    if (got !== archiveSha256) throw new AppError(`readback mismatch for ${archiveKey}`, 1)
    repos.push({
      name: mirror.name,
      commitCount: mirror.commitCount,
      empty: mirror.empty,
      refs: [...mirror.refs],
      archiveKey,
      archiveSha256,
      archiveBytes,
    })
  }

  const archivesMatch = previous
    && previous.detailsSha256 === detailsSha
    && previous.stateId === stateId
    && previous.repos.length === repos.length
    && previous.repos.every((repo, index) => repo.archiveSha256 === repos[index]?.archiveSha256)
  if (archivesMatch) return 'unchanged'

  const detailsHead = await client.head(detailsKey)
  if (!detailsHead || detailsHead.sha256 !== detailsSha) {
    await client.putBytes(detailsKey, detailsBody, detailsSha)
    const stored = await client.getBytes(detailsKey)
    if (!stored || sha256Bytes(stored) !== detailsSha) throw new AppError(`readback mismatch for ${detailsKey}`, 1)
  }

  const manifest: Manifest = {
    format: 1,
    destination: opts.kind,
    login: input.details.login,
    stateId,
    createdAt: input.createdAt,
    detailsSha256: detailsSha,
    detailsKey,
    repos,
  }
  const manifestBody = Buffer.from(stableStringify(manifest))
  // A crash before this write leaves the previous manifest pointing at the previous objects.
  await client.putBytes(manifestKey, manifestBody, sha256Bytes(manifestBody))
  const storedManifest = await client.getBytes(manifestKey)
  if (!storedManifest || sha256Bytes(storedManifest) !== sha256Bytes(manifestBody)) {
    if (previousBytes) await client.putBytes(manifestKey, previousBytes, sha256Bytes(previousBytes))
    throw new AppError(`readback mismatch for ${manifestKey}`, 1)
  }
  return 'published'
}

async function restoreBucket(client: ObjectClient, manifestKey: string, outDir: string): Promise<void> {
  await assertEmptyDir(outDir)
  const bytes = await client.getBytes(manifestKey)
  if (!bytes) throw new AppError('no manifest in the bucket', 1)
  const manifest = parseManifest(JSON.parse(bytes.toString('utf8')))
  if (!manifest.detailsKey) throw new AppError('manifest has no details object', 1)
  const work = await mkdtemp(join(dirname(outDir), '.gitbackup-restore-'))
  try {
    for (const repo of manifest.repos) {
      if (!repo.archiveKey || !repo.archiveSha256) throw new AppError(`manifest has no archive for ${repo.name}`, 1)
      const tarPath = join(work, `${repo.name}.tar.gz`)
      await client.download(repo.archiveKey, tarPath)
      const got = await sha256File(tarPath)
      if (got !== repo.archiveSha256) throw new AppError(`readback mismatch for ${repo.name}`, 1)
      await extractTar(tarPath, outDir)
      await assertRefsMatch(join(outDir, `${repo.name}.git`), repo.refs)
    }
    const details = await client.getBytes(manifest.detailsKey)
    if (!details || sha256Bytes(details) !== manifest.detailsSha256) {
      throw new AppError('details hash did not match the manifest', 1)
    }
    await writeBytes(join(outDir, 'details.json'), details)
    await writeBytes(join(outDir, 'manifest.json'), Buffer.from(stableStringify(manifest)))
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

export function objectKey(...parts: string[]): string {
  const segments = parts.flatMap((part) => part.split('/').filter(Boolean))
  for (const segment of segments) assertSafeRelative(segment)
  return segments.join('/')
}

export async function assertEmptyDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  const entries = await readdir(dir)
  if (entries.length > 0) throw new AppError(`${dir} is not empty`, 2)
}
