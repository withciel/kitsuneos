import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type {
  IngestRecord,
  IngestSourceKind,
  JsonValue,
} from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';

function walkMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkMarkdownFiles(full));
    } else if (extname(entry).toLowerCase() === '.md') {
      out.push(full);
    }
  }
  return out;
}

function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  if (!raw.startsWith('---\n')) {
    return { meta: {}, body: raw };
  }
  const end = raw.indexOf('\n---\n', 4);
  if (end === -1) return { meta: {}, body: raw };
  const block = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const meta: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key) meta[key] = value;
  }
  return { meta, body };
}

function titleFromPath(filePath: string): string {
  return basename(filePath, extname(filePath)).replace(/[-_]+/g, ' ');
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]!);
  const rows: Array<Record<string, string>> = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]!] = cells[i] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function applyFieldMap(
  row: Record<string, string>,
  fieldMap: Record<string, string>,
): Record<string, JsonValue> {
  const out: Record<string, JsonValue> = {};
  for (const [target, source] of Object.entries(fieldMap)) {
    if (source in row) {
      out[target] = row[source]!;
    }
  }
  return out;
}

export function parseIngestSource(input: {
  source: IngestSourceKind;
  path: string;
  collection: string;
  fieldMap?: Record<string, string>;
}): { collection: string; records: IngestRecord[] } {
  const { source, path, collection, fieldMap } = input;
  const st = statSync(path);

  if (source === 'kb' || source === 'cms') {
    if (st.isDirectory()) {
      const files = walkMarkdownFiles(path);
      const records: IngestRecord[] = files.map((file) => {
        const raw = readFileSync(file, 'utf8');
        const { meta, body } = parseFrontmatter(raw);
        const fields: Record<string, JsonValue> = {
          title: meta.title ?? titleFromPath(file),
          body: body.trim(),
        };
        return meta.id ? { id: meta.id, fields } : { fields };
      });
      return { collection, records };
    }

    if (extname(path).toLowerCase() === '.md') {
      const raw = readFileSync(path, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      const fields: Record<string, JsonValue> = {
        title: meta.title ?? titleFromPath(path),
        body: body.trim(),
      };
      return {
        collection,
        records: [meta.id ? { id: meta.id, fields } : { fields }],
      };
    }

    if (extname(path).toLowerCase() === '.json') {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const rows = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === 'object' &&
            Array.isArray((parsed as { records?: unknown }).records)
          ? (parsed as { records: unknown[] }).records
          : null;
      if (!rows) {
        throw new KitsuneError(
          'JSON ingest expects an array of records',
          'validation',
        );
      }
      const records: IngestRecord[] = rows.map((row) => {
        if (!row || typeof row !== 'object') {
          throw new KitsuneError('Invalid JSON record', 'validation');
        }
        const obj = row as Record<string, JsonValue>;
        const id = typeof obj.id === 'string' ? obj.id : undefined;
        const { id: _id, ...fields } = obj;
        return id ? { id, fields } : { fields };
      });
      return { collection, records };
    }

    throw new KitsuneError(
      `${source} ingest expects a directory, .md, or .json file`,
      'validation',
    );
  }

  if (!st.isFile()) {
    throw new KitsuneError(`${source} ingest expects a file`, 'validation');
  }
  const map = fieldMap ?? {};
  if (extname(path).toLowerCase() === '.csv') {
    const rows = parseCsv(readFileSync(path, 'utf8'));
    const records: IngestRecord[] = rows.map((row) => {
      const fields =
        Object.keys(map).length > 0
          ? applyFieldMap(row, map)
          : (row as Record<string, JsonValue>);
      const id =
        typeof fields.id === 'string'
          ? fields.id
          : typeof row.id === 'string'
            ? row.id
            : undefined;
      if (id) {
        const { id: _drop, ...rest } = fields;
        return { id, fields: rest };
      }
      return { fields };
    });
    return { collection, records };
  }

  if (extname(path).toLowerCase() === '.json') {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) {
      throw new KitsuneError('JSON ingest expects an array', 'validation');
    }
    const records: IngestRecord[] = parsed.map((row) => {
      if (!row || typeof row !== 'object') {
        throw new KitsuneError('Invalid JSON record', 'validation');
      }
      const obj = row as Record<string, string>;
      const fields =
        Object.keys(map).length > 0
          ? applyFieldMap(obj, map)
          : (obj as Record<string, JsonValue>);
      const id = typeof fields.id === 'string' ? fields.id : undefined;
      if (id) {
        const { id: _drop, ...rest } = fields;
        return { id, fields: rest };
      }
      return { fields };
    });
    return { collection, records };
  }

  throw new KitsuneError(
    `${source} ingest expects .csv or .json`,
    'validation',
  );
}
