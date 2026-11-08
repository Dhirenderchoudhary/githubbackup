#!/usr/bin/env node
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { S3Client } from '@aws-sdk/client-s3'
import { backup, formatReport, type BackupResult } from './backup.ts'
import { createBucketPublisher } from './bucket.ts'
import { loadDestination, type ResolvedDestination } from './config.ts'
import { AppError, redact, type DestinationKind } from './domain.ts'
import { createDrivePublisher, driveApi, startDriveAuth } from './drive.ts'
import { githubClient, type RepoFilters } from './github.ts'
import { bucketClientOptions, createS3ObjectClient } from './object-client.ts'

interface IO {
  stdout: { write(chunk: string): void }
  stderr: { write(chunk: string): void }
}

type Command =
  | { kind: 'backup', configPath: string, to: DestinationKind | null, acceptRemoved: boolean, filters: RepoFilters | null, selected: string[], progress: boolean }
  | { kind: 'restore', configPath: string, to: DestinationKind | null, out: string | null }
  | { kind: 'repos', filters: RepoFilters }
  | { kind: 'check', configPath: string, to: DestinationKind | null }
  | { kind: 'auth' }
  | { kind: 'help' }

export async function main(argv: string[], env: NodeJS.ProcessEnv, io: IO = { stdout: process.stdout, stderr: process.stderr }): Promise<number> {
  const secrets = [env.GITHUB_TOKEN, env.AWS_SECRET_ACCESS_KEY, env.R2_SECRET_ACCESS_KEY, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REFRESH_TOKEN].filter((value): value is string => Boolean(value))
  try {
    const command = parseCommand(argv)
    if (command.kind === 'help') {
      io.stdout.write(`${HELP}\n`)
      return 0
    }
    if (command.kind === 'repos') {
      const token = env.GITHUB_TOKEN
      if (!token) throw new AppError('GITHUB_TOKEN is missing', 2)
      const repos = await githubClient(token).listRepos(command.filters)
      io.stdout.write(`${JSON.stringify(repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.fullName,
        private: repo.private,
        fork: repo.fork,
        ownerLogin: repo.ownerLogin,
        description: repo.description,
        source: repo.source,
      })))}\n`)
      return 0
    }
    if (command.kind === 'auth') {
      const clientId = env.GOOGLE_CLIENT_ID
      const clientSecret = env.GOOGLE_CLIENT_SECRET
      if (!clientId || !clientSecret) throw new AppError('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are missing', 2)
      const refresh = await startDriveAuth({ clientId, clientSecret })
      io.stdout.write(`${refresh}\n`)
      return 0
    }
    // check and restore only talk to the destination, so they work without a GitHub token.
    const needsGithub = command.kind === 'backup'
    const destination = await loadDestination(command.configPath, needsGithub ? env : { ...env, GITHUB_TOKEN: env.GITHUB_TOKEN || 'not-needed' }, command.to)
    if (command.kind === 'check') {
      io.stdout.write(`${JSON.stringify({ kind: destination.kind, where: describeDestination(destination) })}\n`)
      return 0
    }
    const cacheDir = join(homedir(), '.cache', 'gitbackup')
    if (command.kind === 'backup') {
      if (command.progress) io.stdout.write(`Reading your GitHub account, then the last backup in ${describeDestination(destination)}\n`)
      const result = await backup({
        github: githubClient(destination.githubToken),
        destination: publisherFor(destination, cacheDir),
        cacheDir,
        token: destination.githubToken,
        acceptRemoved: command.acceptRemoved,
        filters: command.filters ?? undefined,
        selected: command.selected,
        onEvent: command.progress
          ? (event) => io.stdout.write(`status\t${event.name}\t${event.stage}\t${event.message ?? ''}\n`)
          : undefined,
      })
      io.stdout.write(`${formatReport(result)}\n`)
      return 0
    }
    if (!command.out) throw new AppError('restore needs --out <directory>', 2)
    await publisherFor(destination, cacheDir).restore(command.out)
    io.stdout.write(`restored into ${command.out}\n`)
    return 0
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error), secrets)
    io.stderr.write(`${message}\n`)
    return error instanceof AppError ? error.exitCode : 1
  }
}

export function parseCommand(argv: string[]): Command {
  const flags = new Map<string, string | true>()
  const positionals: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') return { kind: 'help' }
    if (arg === '--accept-removed' || arg === '--progress') {
      flags.set(arg, true)
      continue
    }
    if (arg.startsWith('--')) {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) throw new AppError(`${arg} needs a value`, 2)
      flags.set(arg, value)
      i += 1
      continue
    }
    positionals.push(arg)
  }
  const command = positionals[0]
  const configPath = typeof flags.get('--config') === 'string' ? flags.get('--config') as string : join(homedir(), '.config', 'gitbackup', 'config.json')
  const to = parseTo(flags.get('--to'))
  if (command === 'auth' && positionals[1] === 'drive') return { kind: 'auth' }
  if (command === 'check') return { kind: 'check', configPath, to }
  if (command === 'repos') return { kind: 'repos', filters: filtersFrom(flags.get('--filters')) ?? defaultFilters() }
  if (command === 'backup') {
    const selected = typeof flags.get('--select') === 'string' ? (flags.get('--select') as string).split(',').filter(Boolean) : []
    return {
      kind: 'backup',
      configPath,
      to,
      acceptRemoved: flags.get('--accept-removed') === true,
      filters: filtersFrom(flags.get('--filters')),
      selected,
      progress: flags.get('--progress') === true,
    }
  }
  if (command === 'restore') {
    const out = flags.get('--out')
    return { kind: 'restore', configPath, to, out: typeof out === 'string' ? out : null }
  }
  throw new AppError(HELP, 2)
}

function defaultFilters(): RepoFilters {
  return { owned: true, organization: false, starred: false, forked: false, collaborator: false }
}

function filtersFrom(value: string | true | undefined): RepoFilters | null {
  if (typeof value !== 'string') return null
  const names = value === 'none' ? [] : value.split(',').filter(Boolean)
  const allowed = ['owned', 'organization', 'starred', 'forked', 'collaborator']
  for (const name of names) {
    if (!allowed.includes(name)) throw new AppError(`unknown filter ${name}`, 2)
  }
  return {
    owned: names.includes('owned'),
    organization: names.includes('organization'),
    starred: names.includes('starred'),
    forked: names.includes('forked'),
    collaborator: names.includes('collaborator'),
  }
}

function parseTo(value: string | true | undefined): DestinationKind | null {
  if (value == null) return null
  if (value === 's3' || value === 'r2' || value === 'drive') return value
  throw new AppError('Choose one destination. Set GITBACKUP_TO in .env to s3, r2, or drive.', 2)
}

function describeDestination(destination: ResolvedDestination): string {
  if (destination.kind === 'drive') return destination.folderId === 'root' ? 'My Drive' : `Drive folder ${destination.folderId}`
  return `${destination.bucket}/${destination.prefix}`
}

function publisherFor(destination: ResolvedDestination, cacheDir: string) {
  const workDir = join(cacheDir, 'work')
  if (destination.kind === 'drive') {
    return createDrivePublisher(driveApi(destination), workDir)
  }
  const options = bucketClientOptions(destination)
  const client = new S3Client({
    region: options.region,
    endpoint: options.endpoint,
    forcePathStyle: options.forcePathStyle,
    credentials: { accessKeyId: destination.accessKeyId, secretAccessKey: destination.secretAccessKey },
  })
  return createBucketPublisher(createS3ObjectClient(client, destination.bucket), {
    kind: destination.kind,
    prefix: destination.prefix,
    workDir,
  })
}

const HELP = `gitbackup backup --to s3|r2|drive
gitbackup check --to s3|r2|drive
gitbackup repos --filters owned,organization,starred,forked,collaborator
gitbackup restore --to s3|r2|drive --out <directory>
gitbackup auth drive

One run writes to one destination. With no --filters flag, repositories you created are saved.
--filters picks owned, organization, starred, forked, and collaborator repositories.
check prints the destination the next backup writes to, or what is missing.
--select owner/name limits the run to that list. Each selected repository keeps its branches, tags, and notes.
Drive receives one zip. S3 and R2 receive the repos in the bucket you name.`

function loadLocalEnv(): void {
  try {
    process.loadEnvFile('.env')
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
    if (code === 'ENOENT') return
    throw error
  }
}

// npx runs this through a symlink in node_modules/.bin, so compare real paths.
const invoked = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
if (invoked) {
  loadLocalEnv()
  main(process.argv.slice(2), process.env).then((code) => {
    process.exit(code)
  })
}

export type { BackupResult }
