import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, readlink, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { ZipFile } from 'yazl'
import { open as openZip } from 'yauzl'
import { extract, create } from 'tar'
import { AppError, assertSafeRelative } from './domain.ts'

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

export async function tarDirectory(dir: string, tarPath: string): Promise<void> {
  await mkdir(dirname(tarPath), { recursive: true })
  await create({ gzip: true, file: tarPath, cwd: dirname(dir), portable: true }, [basenameSafe(dir)])
}

export async function extractTar(tarPath: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  await extract({
    file: tarPath,
    cwd: dest,
    strict: true,
    preservePaths: false,
    filter(path) {
      assertSafeRelative(path)
      return true
    },
  })
}

export async function zipSnapshot(opts: {
  zipPath: string
  mirrors: readonly { name: string, bareDir: string }[]
  files: readonly { name: string, body: Buffer }[]
}): Promise<void> {
  await mkdir(dirname(opts.zipPath), { recursive: true })
  const zip = new ZipFile()
  for (const file of opts.files) {
    assertSafeRelative(file.name)
    zip.addBuffer(file.body, file.name, { mtime: new Date('1980-01-01T00:00:00Z') })
  }
  for (const mirror of opts.mirrors) {
    assertSafeRelative(mirror.name)
    await addTree(zip, mirror.bareDir, `repos/${mirror.name}.git`)
  }
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(opts.zipPath)
    const fail = (error: Error) => reject(error)
    out.on('close', () => resolve())
    out.on('error', fail)
    zip.outputStream.on('error', fail)
    zip.outputStream.pipe(out)
    zip.end()
  })
}

export async function unzipSnapshot(zipPath: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  const zipfile = await new Promise<import('yauzl').ZipFile>((resolve, reject) => {
    openZip(zipPath, { lazyEntries: true }, (error, opened) => {
      if (error || !opened) reject(error ?? new Error('zip did not open'))
      else resolve(opened)
    })
  })
  await new Promise<void>((resolve, reject) => {
    let pending = 0
    let ended = false
    const finish = () => {
      if (ended && pending === 0) resolve()
    }
    const fail = (error: unknown) => reject(error instanceof Error ? error : new Error(String(error)))
    zipfile.on('error', fail)
    zipfile.on('end', () => {
      ended = true
      finish()
    })
    zipfile.on('entry', (entry) => {
      const name = entry.fileName.replace(/\\/g, '/')
      pending += 1
      const done = () => {
        pending -= 1
        zipfile.readEntry()
        finish()
      }
      try {
        if (name.endsWith('/')) {
          assertSafeRelative(name.slice(0, -1))
          mkdir(join(dest, name), { recursive: true }).then(done, fail)
          return
        }
        assertSafeRelative(name)
        const target = join(dest, name)
        mkdir(dirname(target), { recursive: true }).then(() => {
          zipfile.openReadStream(entry, (error, stream) => {
            if (error || !stream) {
              fail(error ?? new Error('zip entry had no stream'))
              return
            }
            const out = createWriteStream(target)
            stream.on('error', fail)
            out.on('error', fail)
            out.on('close', done)
            stream.pipe(out)
          })
        }, fail)
      } catch (error) {
        fail(error)
      }
    })
    zipfile.readEntry()
  })
}

async function addTree(zip: ZipFile, dir: string, prefix: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    const name = `${prefix}/${entry.name}`
    assertSafeRelative(name)
    if (entry.isSymbolicLink()) {
      const link = await readlink(full)
      if (relative(dir, join(dir, link)).startsWith('..')) throw new AppError(`unsafe link ${name}`, 1)
      throw new AppError(`refusing to zip symlink ${name}`, 1)
    }
    if (entry.isDirectory()) {
      zip.addEmptyDirectory(`${name}/`, { mtime: new Date('1980-01-01T00:00:00Z') })
      await addTree(zip, full, name)
      continue
    }
    if (!entry.isFile()) throw new AppError(`refusing to zip ${name}`, 1)
    const info = await stat(full)
    zip.addFile(full, name, { mtime: new Date('1980-01-01T00:00:00Z'), mode: info.mode })
  }
}

function basenameSafe(dir: string): string {
  const name = dir.split('/').filter(Boolean).at(-1)
  if (!name) throw new AppError(`unsafe directory ${dir}`, 1)
  assertSafeRelative(name)
  return name
}

export async function writeBytes(path: string, body: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body)
}
