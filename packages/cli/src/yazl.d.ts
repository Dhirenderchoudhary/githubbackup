declare module 'yazl' {
  import { Readable } from 'node:stream'

  export class ZipFile {
    outputStream: Readable
    addFile(realPath: string, metadataPath: string, options?: { mtime?: Date, mode?: number }): void
    addBuffer(buffer: Buffer, metadataPath: string, options?: { mtime?: Date }): void
    addEmptyDirectory(metadataPath: string, options?: { mtime?: Date }): void
    end(): void
  }
}
