import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { AppError } from './domain.ts'

export interface StoredHead {
  bytes: number
  sha256: string
}

export interface ObjectClient {
  putFile(key: string, filePath: string, sha256: string): Promise<void>
  putBytes(key: string, body: Buffer, sha256: string): Promise<void>
  head(key: string): Promise<StoredHead | null>
  getBytes(key: string): Promise<Buffer | null>
  download(key: string, dest: string): Promise<void>
}

export function bucketClientOptions(dest: {
  kind: 's3' | 'r2'
  region?: string
  endpoint?: string | null
  accountId?: string
}): { region: string, endpoint?: string, forcePathStyle: boolean } {
  if (dest.kind === 'r2') {
    if (!dest.accountId) throw new AppError('R2 account id is missing', 2)
    return {
      region: 'auto',
      endpoint: `https://${dest.accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
    }
  }
  return {
    region: dest.region || 'us-east-1',
    endpoint: dest.endpoint || undefined,
    forcePathStyle: Boolean(dest.endpoint),
  }
}

export function createS3ObjectClient(client: S3Client, bucket: string): ObjectClient {
  return {
    async putFile(key, filePath, sha256) {
      const upload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: key,
          Body: createReadStream(filePath),
          Metadata: { sha256 },
        },
        leavePartsOnError: false,
      })
      await upload.done()
    },
    async putBytes(key, body, sha256) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        Metadata: { sha256 },
      }))
    },
    async head(key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        if (out.ContentLength == null || !out.Metadata?.sha256) return null
        return { bytes: out.ContentLength, sha256: out.Metadata.sha256 }
      } catch (error) {
        if (missing(error)) return null
        throw error
      }
    },
    async getBytes(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        if (!out.Body) return null
        const chunks: Buffer[] = []
        for await (const chunk of out.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk))
        return Buffer.concat(chunks)
      } catch (error) {
        if (missing(error)) return null
        throw error
      }
    },
    async download(key, dest) {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      if (!out.Body) throw new AppError(`empty object ${key}`, 1)
      await mkdir(dirname(dest), { recursive: true })
      await pipeline(out.Body as Readable, createWriteStream(dest))
    },
  }
}

function missing(error: unknown): boolean {
  const err = error as { name?: string, $metadata?: { httpStatusCode?: number } }
  return err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404
}
