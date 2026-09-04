import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface BlobStore {
  put(contentHash: string, bytes: Buffer): Promise<void>;
  get(contentHash: string): Promise<Buffer>;
  exists(contentHash: string): Promise<boolean>;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Local content-addressed store for CI and docker. Not a record store. */
export class LocalFilesystemBlobStore implements BlobStore {
  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
  }

  private pathFor(hash: string): string {
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error('Invalid content hash');
    }
    return join(this.rootDir, hash.slice(0, 2), hash.slice(2, 4), hash);
  }

  async put(contentHash: string, bytes: Buffer): Promise<void> {
    const target = this.pathFor(contentHash);
    if (existsSync(target)) return;
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, bytes);
  }

  async get(contentHash: string): Promise<Buffer> {
    const target = this.pathFor(contentHash);
    if (!existsSync(target)) {
      throw new Error('Blob not found');
    }
    return readFileSync(target);
  }

  async exists(contentHash: string): Promise<boolean> {
    return existsSync(this.pathFor(contentHash));
  }
}

export function createDefaultBlobStore(): BlobStore {
  const root =
    process.env.KITSUNE_BLOB_DIR ?? join(process.cwd(), '.kitsune-blobs');
  return new LocalFilesystemBlobStore(root);
}
