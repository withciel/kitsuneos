/**
 * Minimal ZIP reader/writer for the vault import/export MVP.
 *
 * Writing uses STORED (uncompressed) entries — vault markdown files are small
 * text, so skipping DEFLATE keeps this dependency-free. Reading supports both
 * STORED and DEFLATE so zips produced by other tools (Finder, `zip -r`, …)
 * still import correctly.
 */
import { crc32, inflateRawSync } from 'node:zlib';
import { VAULT_ZIP_LIMITS } from './vault-zip-limits';

export interface ZipEntry {
  name: string;
  data: Buffer;
}

export { VAULT_ZIP_LIMITS } from './vault-zip-limits';

export interface ZipReadLimits {
  maxEntries?: number;
  maxInflatedBytes?: number;
}

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const EOCD_SIG_BYTES = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

function dosDateTime(date: Date): { time: number; dateVal: number } {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const dateVal =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  return { time, dateVal };
}

/** Build an uncompressed (STORED) zip archive from the given entries. */
export function buildZip(entries: ZipEntry[]): Buffer {
  const { time, dateVal } = dosDateTime(new Date());
  const fileChunks: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data) >>> 0;
    const size = entry.data.length;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_FILE_HEADER_SIG, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(dateVal, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    fileChunks.push(localHeader, nameBuf, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_DIR_SIG, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(dateVal, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(size, 20);
    centralHeader.writeUInt32LE(size, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralRecords.push(Buffer.concat([centralHeader, nameBuf]));

    offset += localHeader.length + nameBuf.length + entry.data.length;
  }

  const centralDir = Buffer.concat(centralRecords);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...fileChunks, centralDir, eocd]);
}

/** Read a zip archive, decompressing STORED and DEFLATE entries. */
export function readZip(
  buffer: Buffer,
  limits: ZipReadLimits = {},
): ZipEntry[] {
  const maxEntries = limits.maxEntries ?? VAULT_ZIP_LIMITS.maxEntries;
  const maxInflatedBytes =
    limits.maxInflatedBytes ?? VAULT_ZIP_LIMITS.maxInflatedBytes;

  const eocdIdx = buffer.lastIndexOf(EOCD_SIG_BYTES);
  if (eocdIdx === -1) {
    throw new Error('Not a valid zip file (missing end of central directory)');
  }
  const totalEntries = buffer.readUInt16LE(eocdIdx + 10);
  if (totalEntries > maxEntries) {
    throw new Error(
      `Zip has too many entries (max ${maxEntries}; prefer the CLI for large vaults)`,
    );
  }
  const centralDirOffset = buffer.readUInt32LE(eocdIdx + 16);

  const entries: ZipEntry[] = [];
  let totalInflated = 0;
  let ptr = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (ptr + 46 > buffer.length) {
      throw new Error('Corrupt zip central directory');
    }
    const sig = buffer.readUInt32LE(ptr);
    if (sig !== CENTRAL_DIR_SIG) {
      throw new Error('Corrupt zip central directory');
    }
    const method = buffer.readUInt16LE(ptr + 10);
    const compSize = buffer.readUInt32LE(ptr + 20);
    const declaredUncompSize = buffer.readUInt32LE(ptr + 24);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    if (localHeaderOffset + 30 > buffer.length || localHeaderOffset < 0) {
      throw new Error('Corrupt zip local file header');
    }
    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > buffer.length) {
      throw new Error('Corrupt zip local file data');
    }
    const compressedData = buffer.subarray(dataStart, dataStart + compSize);

    const remaining = maxInflatedBytes - totalInflated;
    if (remaining <= 0 || declaredUncompSize > remaining) {
      throw new Error(
        `Zip exceeds maximum inflated size of ${maxInflatedBytes} bytes (prefer the CLI for large vaults)`,
      );
    }

    let data: Buffer;
    if (method === 0) {
      if (compSize > remaining) {
        throw new Error(
          `Zip exceeds maximum inflated size of ${maxInflatedBytes} bytes (prefer the CLI for large vaults)`,
        );
      }
      data = Buffer.from(compressedData);
    } else if (method === 8) {
      try {
        data = inflateRawSync(compressedData, {
          maxOutputLength: remaining,
        });
      } catch {
        throw new Error(
          `Zip exceeds maximum inflated size of ${maxInflatedBytes} bytes (prefer the CLI for large vaults)`,
        );
      }
    } else {
      throw new Error(`Unsupported zip compression method: ${method}`);
    }

    totalInflated += data.length;
    if (totalInflated > maxInflatedBytes) {
      throw new Error(
        `Zip exceeds maximum inflated size of ${maxInflatedBytes} bytes (prefer the CLI for large vaults)`,
      );
    }

    entries.push({ name, data });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
