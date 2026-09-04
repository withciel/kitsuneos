import type { JsonValue } from '../types.js';
import { KitsuneError } from '../types.js';

export type VfsPath =
  | { kind: 'root' }
  | { kind: 'collection'; collection: string }
  | { kind: 'record'; collection: string; recordId: string }
  | {
      kind: 'field';
      collection: string;
      recordId: string;
      field: string;
      format: 'md' | 'json';
    };

export interface VfsListEntry {
  name: string;
  type: 'dir' | 'file';
  path: string;
}

export interface VfsListResult {
  path: string;
  entries: VfsListEntry[];
}

export interface VfsReadResult {
  path: string;
  content: string;
  contentType: string;
}

const COLLECTION_RE = /^[a-z_][a-z0-9_]*$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELD_RE = /^[a-z_][a-z0-9_]*$/;

/** Normalize and parse a virtual path. Leading slash required. */
export function parseVfsPath(raw: string): VfsPath {
  if (typeof raw !== 'string' || !raw.startsWith('/')) {
    throw new KitsuneError('VFS path must start with /', 'validation');
  }
  const trimmed = raw.replace(/\/+$/, '') || '/';
  if (trimmed.includes('..') || trimmed.includes('//')) {
    throw new KitsuneError('Invalid VFS path', 'validation');
  }
  const parts = trimmed === '/' ? [] : trimmed.slice(1).split('/');

  if (parts.length === 0) return { kind: 'root' };

  const collection = parts[0]!;
  if (!COLLECTION_RE.test(collection)) {
    throw new KitsuneError(
      `Invalid collection in path: ${collection}`,
      'validation',
    );
  }
  if (parts.length === 1) return { kind: 'collection', collection };

  const recordId = parts[1]!;
  if (!UUID_RE.test(recordId)) {
    throw new KitsuneError('Invalid record id in path', 'validation');
  }
  if (parts.length === 2) {
    return { kind: 'record', collection, recordId };
  }

  if (parts.length !== 3) {
    throw new KitsuneError('VFS path too deep', 'validation');
  }
  const file = parts[2]!;
  const md = file.match(/^(.+)\.md$/);
  const json = file.match(/^(.+)\.json$/);
  const field = md?.[1] ?? json?.[1] ?? '';
  if (!FIELD_RE.test(field)) {
    throw new KitsuneError(`Invalid field file: ${file}`, 'validation');
  }
  return {
    kind: 'field',
    collection,
    recordId,
    field,
    format: md ? 'md' : 'json',
  };
}

export function fieldFileName(field: string, type: string): string {
  return type === 'prose' ? `${field}.md` : `${field}.json`;
}

export function serializeField(
  value: JsonValue | undefined,
  format: 'md' | 'json',
): string {
  if (format === 'md') {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  }
  return `${JSON.stringify(value ?? null, null, 2)}\n`;
}
