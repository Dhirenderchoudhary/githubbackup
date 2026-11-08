import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError, parseManifest, sha256Bytes, stableStringify, stateIdOf, type Manifest } from './domain.ts'
import { assertRefsMatch } from './mirror.ts'
import { sha256File, unzipSnapshot, writeBytes, zipSnapshot } from './pack.ts'
import { assertEmptyDir, type PublishInput, type Publisher, type SavedPointer } from './bucket.ts'

export interface DriveFile {
  id: string
}

export interface DriveApi {
  find(name: string): Promise<DriveFile | null>
  create(name: string, body: Buffer, mime: string): Promise<DriveFile>
  replace(id: string, body: Buffer, mime: string): Promise<void>
  download(id: string): Promise<Buffer>
}

interface LatestPointer {
  format: 1
  stateId: string
  detailsSha256: string
  repoNames: string[]
  zip: { id: string, name: string, sha256: string, bytes: number }
}

const LATEST = 'gitbackup-latest.json'
const DETAILS = 'gitbackup-details.json'

export function createDrivePublisher(api: DriveApi, workDir: string): Publisher {
  return {
    kind: 'drive',
    current: async () => {
      const latest = await readLatest(api)
      if (!latest) return null
      const pointer: SavedPointer = { stateId: latest.stateId, repoNames: latest.repoNames }
      return pointer
    },
    publish: (input) => publishDrive(api, workDir, input),
    restore: (outDir) => restoreDrive(api, workDir, outDir),
  }
}

async function publishDrive(api: DriveApi, workDir: string, input: PublishInput): Promise<'published' | 'unchanged'> {
  const previous = await readLatest(api)
  const stateId = stateIdOf(input.details.login, input.mirrors)
  const detailsBody = Buffer.from(stableStringify(input.details))
  const detailsSha = sha256Bytes(detailsBody)
  if (previous && previous.stateId === stateId && previous.detailsSha256 === detailsSha) return 'unchanged'

  let zip = previous?.zip
  if (!previous || previous.stateId !== stateId) {
    const manifest: Manifest = {
      format: 1,
      destination: 'drive',
      login: input.details.login,
      stateId,
      createdAt: input.createdAt,
      detailsSha256: detailsSha,
      detailsKey: null,
      repos: [...input.mirrors].sort((a, b) => a.name.localeCompare(b.name)).map((mirror) => ({
        name: mirror.name,
        commitCount: mirror.commitCount,
        empty: mirror.empty,
        refs: [...mirror.refs],
        archiveKey: null,
        archiveSha256: null,
        archiveBytes: null,
      })),
    }
    const manifestBody = Buffer.from(stableStringify(manifest))
    await mkdir(workDir, { recursive: true })
    const dir = await mkdtemp(join(workDir, 'zip-'))
    const zipPath = join(dir, 'snapshot.zip')
    await zipSnapshot({
      zipPath,
      mirrors: input.mirrors,
      files: [
        { name: 'manifest.json', body: manifestBody },
        { name: 'details.json', body: detailsBody },
      ],
    })
    const body = await readFile(zipPath)
    const sha256 = sha256Bytes(body)
    const name = `gitbackup-${input.createdAt.replace(/[:]/g, '')}.zip`
    const created = await api.create(name, body, 'application/zip')
    const stored = await api.download(created.id)
    await rm(dir, { recursive: true, force: true })
    if (sha256Bytes(stored) !== sha256) throw new AppError('Drive zip readback did not match', 1)
    zip = { id: created.id, name, sha256, bytes: body.length }
  }
  if (!zip) throw new AppError('Drive zip was not uploaded', 1)

  await writeNamed(api, DETAILS, detailsBody, 'application/json')
  const pointer: LatestPointer = {
    format: 1,
    stateId,
    detailsSha256: detailsSha,
    repoNames: input.mirrors.map((mirror) => mirror.name).sort(),
    zip,
  }
  const pointerBody = Buffer.from(stableStringify(pointer))
  // latest.json is the only pointer a restore trusts. It moves after the zip and the details file check out.
  await writeNamed(api, LATEST, pointerBody, 'application/json')
  const latest = await readLatest(api)
  if (!latest || latest.stateId !== stateId || latest.detailsSha256 !== detailsSha || latest.zip.sha256 !== zip.sha256) {
    throw new AppError('Drive latest.json readback did not match', 1)
  }
  return 'published'
}

async function restoreDrive(api: DriveApi, workDir: string, outDir: string): Promise<void> {
  await assertEmptyDir(outDir)
  const latest = await readLatest(api)
  if (!latest) throw new AppError('no gitbackup-latest.json in Drive', 1)
  const zip = await api.download(latest.zip.id)
  if (sha256Bytes(zip) !== latest.zip.sha256) throw new AppError('Drive zip hash did not match latest.json', 1)
  await mkdir(workDir, { recursive: true })
  const dir = await mkdtemp(join(workDir, 'restore-'))
  const zipPath = join(dir, 'snapshot.zip')
  await writeBytes(zipPath, zip)
  const extracted = join(dir, 'out')
  await unzipSnapshot(zipPath, extracted)
  const manifest = parseManifest(JSON.parse(await readText(join(extracted, 'manifest.json'))))
  if (manifest.stateId !== latest.stateId) throw new AppError('zip manifest does not match latest.json', 1)
  for (const repo of manifest.repos) {
    await assertRefsMatch(join(extracted, 'repos', `${repo.name}.git`), repo.refs)
    await moveRepo(join(extracted, 'repos', `${repo.name}.git`), join(outDir, `${repo.name}.git`))
  }
  const sidecar = await readNamed(api, DETAILS)
  const details = sidecar && sha256Bytes(sidecar) === latest.detailsSha256
    ? sidecar
    : Buffer.from(await readText(join(extracted, 'details.json')))
  if (sha256Bytes(details) !== manifest.detailsSha256 && sha256Bytes(details) !== latest.detailsSha256) {
    throw new AppError('details hash did not match the backup', 1)
  }
  await writeBytes(join(outDir, 'details.json'), details)
  await writeBytes(join(outDir, 'manifest.json'), Buffer.from(stableStringify(manifest)))
  await rm(dir, { recursive: true, force: true })
}

async function moveRepo(from: string, to: string): Promise<void> {
  const { rename, cp } = await import('node:fs/promises')
  try {
    await rename(from, to)
  } catch {
    await cp(from, to, { recursive: true })
  }
}

async function writeNamed(api: DriveApi, name: string, body: Buffer, mime: string): Promise<void> {
  const existing = await api.find(name)
  if (existing) await api.replace(existing.id, body, mime)
  else await api.create(name, body, mime)
  const stored = await readNamed(api, name)
  if (!stored || sha256Bytes(stored) !== sha256Bytes(body)) throw new AppError(`Drive readback did not match ${name}`, 1)
}

async function readNamed(api: DriveApi, name: string): Promise<Buffer | null> {
  const existing = await api.find(name)
  if (!existing) return null
  return api.download(existing.id)
}

async function readLatest(api: DriveApi): Promise<LatestPointer | null> {
  const bytes = await readNamed(api, LATEST)
  if (!bytes) return null
  const value = JSON.parse(bytes.toString('utf8')) as Partial<LatestPointer>
  if (value.format !== 1 || !value.stateId || !value.detailsSha256 || !value.zip?.id || !value.zip.sha256 || !value.zip.name) {
    throw new AppError('gitbackup-latest.json is invalid', 1)
  }
  return {
    format: 1,
    stateId: value.stateId,
    detailsSha256: value.detailsSha256,
    repoNames: value.repoNames ?? [],
    zip: { id: value.zip.id, name: value.zip.name, sha256: value.zip.sha256, bytes: value.zip.bytes ?? 0 },
  }
}

async function readText(path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises')
  return readFile(path, 'utf8')
}

export function driveApi(opts: {
  folderId: string
  clientId: string
  clientSecret: string
  refreshToken: string
  fetchImpl?: typeof fetch
}): DriveApi {
  const fetchImpl = opts.fetchImpl ?? fetch
  let token: Promise<string> | null = null
  const bearer = async (): Promise<string> => {
    if (!token) {
      token = requestAccessToken(opts, fetchImpl).catch((error) => {
        token = null
        throw error
      })
    }
    return token
  }
  return {
    find: (name) => findFile(opts.folderId, name, bearer, fetchImpl),
    create: (name, body, mime) => uploadNew(opts.folderId, name, body, mime, bearer, fetchImpl),
    replace: (id, body, mime) => replaceFile(id, body, mime, bearer, fetchImpl),
    download: (id) => downloadFile(id, bearer, fetchImpl),
  }
}

async function requestAccessToken(opts: {
  clientId: string
  clientSecret: string
  refreshToken: string
}, fetchImpl: typeof fetch): Promise<string> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    refresh_token: opts.refreshToken,
    grant_type: 'refresh_token',
  })
  const response = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', body })
  if (!response.ok) throw new AppError(`Google token request failed (${response.status})`, 1)
  const json = await response.json() as { access_token?: string }
  if (!json.access_token) throw new AppError('Google token response had no access_token', 1)
  return json.access_token
}

async function findFile(folderId: string, name: string, bearer: () => Promise<string>, fetchImpl: typeof fetch): Promise<{ id: string } | null> {
  const query = `name = '${name.replace(/'/g, "\\'")}' and '${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${await bearer()}` } })
  if (!response.ok) throw new AppError(`Drive file lookup failed (${response.status})`, 1)
  const json = await response.json() as { files?: { id: string }[] }
  return json.files?.[0] ?? null
}

async function uploadNew(folderId: string, name: string, body: Buffer, mime: string, bearer: () => Promise<string>, fetchImpl: typeof fetch): Promise<{ id: string }> {
  const start = await fetchImpl('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await bearer()}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': String(body.length),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  })
  if (!start.ok) throw new AppError(`Drive upload did not start (${start.status})`, 1)
  const location = start.headers.get('location')
  if (!location) throw new AppError('Drive upload did not return a session', 1)
  const put = await fetchImpl(location, {
    method: 'PUT',
    headers: { 'Content-Type': mime, 'Content-Length': String(body.length) },
    body: new Uint8Array(body),
  })
  if (!put.ok) throw new AppError(`Drive upload failed (${put.status})`, 1)
  const json = await put.json() as { id?: string }
  if (!json.id) throw new AppError('Drive upload did not return a file id', 1)
  return { id: json.id }
}

async function replaceFile(id: string, body: Buffer, mime: string, bearer: () => Promise<string>, fetchImpl: typeof fetch): Promise<void> {
  const response = await fetchImpl(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${await bearer()}`,
      'Content-Type': mime,
      'Content-Length': String(body.length),
    },
    body: new Uint8Array(body),
  })
  if (!response.ok) throw new AppError(`Drive replace failed (${response.status})`, 1)
}

async function downloadFile(id: string, bearer: () => Promise<string>, fetchImpl: typeof fetch): Promise<Buffer> {
  const response = await fetchImpl(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
    headers: { Authorization: `Bearer ${await bearer()}` },
  })
  if (!response.ok) throw new AppError(`Drive download failed (${response.status})`, 1)
  return Buffer.from(await response.arrayBuffer())
}

export async function startDriveAuth(opts: {
  clientId: string
  clientSecret: string
  port?: number
  open?: (url: string) => void
  fetchImpl?: typeof fetch
}): Promise<string> {
  const { createServer } = await import('node:http')
  const fetchImpl = opts.fetchImpl ?? fetch
  const port = opts.port ?? 53682
  const redirectUri = `http://127.0.0.1:${port}/callback`
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', opts.clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', redirectUri)
      const value = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      response.end(value ? 'gitbackup received the Google code. You can close this tab.' : 'gitbackup did not receive a code.')
      server.close()
      if (value) resolve(value)
      else reject(new AppError(error ?? 'Google did not return a code', 1))
    })
    server.listen(port, '127.0.0.1', () => {
      ;(opts.open ?? openBrowser)(authUrl.toString())
    })
    server.on('error', reject)
  })
  const body = new URLSearchParams({
    code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const response = await fetchImpl('https://oauth2.googleapis.com/token', { method: 'POST', body })
  if (!response.ok) throw new AppError(`Google code exchange failed (${response.status})`, 1)
  const json = await response.json() as { refresh_token?: string }
  if (!json.refresh_token) throw new AppError('Google did not return a refresh token. Run auth again and consent.', 1)
  return json.refresh_token
}

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  spawn(command, args, { stdio: 'ignore', detached: true }).unref()
}
