import { readFile } from 'node:fs/promises'
import { AppError, type DestinationKind } from './domain.ts'

export type ResolvedDestination =
  | {
    kind: 's3'
    githubToken: string
    bucket: string
    region: string
    prefix: string
    endpoint: string | null
    accessKeyId: string
    secretAccessKey: string
  }
  | {
    kind: 'r2'
    githubToken: string
    bucket: string
    accountId: string
    prefix: string
    accessKeyId: string
    secretAccessKey: string
  }
  | {
    kind: 'drive'
    githubToken: string
    folderId: string
    clientId: string
    clientSecret: string
    refreshToken: string
  }

interface ConfigFile {
  to?: DestinationKind
  s3?: { bucket?: string, region?: string, prefix?: string, endpoint?: string }
  r2?: { bucket?: string, accountId?: string, prefix?: string }
  drive?: { folderId?: string }
}

export async function loadDestination(file: string, env: NodeJS.ProcessEnv, to: DestinationKind | null): Promise<ResolvedDestination> {
  const parsed = await readConfig(file)
  const kind = to ?? parsed.to ?? envKind(env.GITBACKUP_TO)
  if (kind !== 's3' && kind !== 'r2' && kind !== 'drive') {
    throw new AppError('Choose one destination. Set GITBACKUP_TO in .env to s3, r2, or drive.', 2)
  }
  const githubToken = required(env, 'GITHUB_TOKEN')
  if (kind === 's3') {
    const block = parsed.s3 ?? {}
    return {
      kind: 's3',
      githubToken,
      bucket: requiredValue(block.bucket || env.S3_BUCKET, 'S3_BUCKET'),
      region: block.region || env.AWS_REGION || 'us-east-1',
      prefix: block.prefix || env.S3_PREFIX || 'gitbackup',
      endpoint: block.endpoint || env.S3_ENDPOINT || null,
      accessKeyId: required(env, 'AWS_ACCESS_KEY_ID'),
      secretAccessKey: required(env, 'AWS_SECRET_ACCESS_KEY'),
    }
  }
  if (kind === 'r2') {
    const block = parsed.r2 ?? {}
    return {
      kind: 'r2',
      githubToken,
      bucket: requiredValue(block.bucket || env.R2_BUCKET, 'R2_BUCKET'),
      accountId: requiredValue(block.accountId || env.R2_ACCOUNT_ID, 'R2_ACCOUNT_ID'),
      prefix: block.prefix || env.R2_PREFIX || 'gitbackup',
      accessKeyId: env.R2_ACCESS_KEY_ID || required(env, 'AWS_ACCESS_KEY_ID'),
      secretAccessKey: env.R2_SECRET_ACCESS_KEY || required(env, 'AWS_SECRET_ACCESS_KEY'),
    }
  }
  const block = parsed.drive ?? {}
  return {
    kind: 'drive',
    githubToken,
    folderId: block.folderId || env.DRIVE_FOLDER_ID || 'root',
    clientId: required(env, 'GOOGLE_CLIENT_ID'),
    clientSecret: required(env, 'GOOGLE_CLIENT_SECRET'),
    refreshToken: required(env, 'GOOGLE_REFRESH_TOKEN'),
  }
}

function envKind(value: string | undefined): DestinationKind | null {
  if (value === 's3' || value === 'r2' || value === 'drive') return value
  return null
}

async function readConfig(file: string): Promise<ConfigFile> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
    if (code === 'ENOENT') return {}
    throw new AppError(`config file not found: ${file}`, 2)
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new AppError(`config file is not JSON: ${file}`, 2)
  }
  if (!value || typeof value !== 'object') throw new AppError('config file must be an object', 2)
  return value as ConfigFile
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value) throw new AppError(`${name} is missing`, 2)
  return value
}

function requiredValue(value: string | undefined, name: string): string {
  if (!value) throw new AppError(`${name} is missing`, 2)
  return value
}
