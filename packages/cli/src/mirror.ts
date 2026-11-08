import { execFile } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { promisify } from 'node:util'
import { AppError, authoredByUser, type AuthorIdentity, type Ref } from './domain.ts'

const exec = promisify(execFile)

export class GitError extends AppError {
  constructor(message: string) {
    super(message, 1)
    this.name = 'GitError'
  }
}

export async function git(args: string[], opts: { cwd?: string, env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  try {
    const { stdout } = await exec('git', args, {
      cwd: opts.cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'gitbackup',
        GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'gitbackup@localhost',
        GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'gitbackup',
        GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || 'gitbackup@localhost',
        ...opts.env,
      },
      maxBuffer: 64 * 1024 * 1024,
    })
    return stdout
  } catch (error) {
    const err = error as { stderr?: string, message?: string }
    throw new GitError((err.stderr || err.message || 'git failed').trim())
  }
}

export function gitAuthEnv(token: string): NodeJS.ProcessEnv {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  }
}

export async function gitLfsAvailable(): Promise<boolean> {
  try {
    await git(['lfs', 'version'])
    return true
  } catch {
    return false
  }
}

export async function listRefs(gitDir: string): Promise<Ref[]> {
  const out = await git(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads', 'refs/tags', 'refs/notes'], { cwd: gitDir })
  if (out.trim() === '') return []
  return out.trim().split('\n').map((line) => {
    const space = line.indexOf(' ')
    return { name: line.slice(space + 1), oid: line.slice(0, space) }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export async function authoredCommitCount(gitDir: string, user: AuthorIdentity): Promise<number> {
  let out = ''
  try {
    out = await git(['log', '--all', '--format=%H%x09%ae%x09%an'], { cwd: gitDir })
  } catch {
    return 0
  }
  const seen = new Set<string>()
  for (const line of out.split('\n')) {
    if (line === '') continue
    const [oid, email, name] = line.split('\t')
    if (!oid || seen.has(oid)) continue
    if (authoredByUser(email ?? '', name ?? '', user)) seen.add(oid)
  }
  return seen.size
}

export async function assertRefsMatch(gitDir: string, expected: readonly Ref[]): Promise<void> {
  const actual = await listRefs(gitDir)
  const wanted = [...expected].sort((a, b) => a.name.localeCompare(b.name))
  const same = actual.length === wanted.length && actual.every((ref, index) => ref.name === wanted[index]?.name && ref.oid === wanted[index]?.oid)
  if (!same) throw new AppError(`restored refs did not match the manifest for ${gitDir}`, 1)
}

export interface Mirror {
  commitCount: number
  refs: Ref[]
  empty: boolean
}

export async function syncMirror(opts: {
  cloneUrl: string
  dest: string
  token: string
  lfsAvailable: boolean
}): Promise<Mirror> {
  await mkdir(dirname(opts.dest), { recursive: true })
  const env = gitAuthEnv(opts.token)
  if (await isBareRepo(opts.dest)) {
    await git(['remote', 'set-url', 'origin', opts.cloneUrl], { cwd: opts.dest, env })
    await git(['fetch', '--prune', 'origin'], { cwd: opts.dest, env })
  } else {
    await rm(opts.dest, { recursive: true, force: true })
    await git(['clone', '--mirror', opts.cloneUrl, opts.dest], { env })
  }
  await deletePullRefs(opts.dest)
  if (await repoUsesLfs(opts.dest)) {
    if (!opts.lfsAvailable) {
      throw new AppError('repo uses Git LFS and git-lfs is not installed', 1)
    }
    await git(['lfs', 'fetch', '--all'], { cwd: opts.dest, env })
  }
  const refs = await listRefs(opts.dest)
  const countOut = refs.length === 0 ? '0' : await git(['rev-list', '--all', '--count'], { cwd: opts.dest })
  const commitCount = Number(countOut.trim())
  if (!Number.isInteger(commitCount)) throw new GitError(`commit count was not a number for ${opts.dest}`)
  return { commitCount, refs, empty: refs.length === 0 }
}

async function isBareRepo(dir: string): Promise<boolean> {
  try {
    const out = await git(['rev-parse', '--is-bare-repository'], { cwd: dir })
    return out.trim() === 'true'
  } catch {
    return false
  }
}

async function deletePullRefs(gitDir: string): Promise<void> {
  let out = ''
  try {
    out = await git(['for-each-ref', '--format=%(refname)', 'refs/pull'], { cwd: gitDir })
  } catch {
    return
  }
  for (const ref of out.split('\n').filter(Boolean)) {
    await git(['update-ref', '-d', ref], { cwd: gitDir })
  }
}

async function repoUsesLfs(gitDir: string): Promise<boolean> {
  try {
    const out = await git(['log', '--all', '-G', 'filter=lfs', '--pretty=format:%H', '--', '.gitattributes'], { cwd: gitDir })
    return out.trim().length > 0
  } catch {
    return false
  }
}
