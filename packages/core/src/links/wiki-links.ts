import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { type CollectionMeta, getCollectionMeta } from '../compiler/query.js';
import { queryRows } from '../db/pool.js';
import { assertFieldAllowed, loadResolvedGrant } from '../grants/resolve.js';
import { canViewPage } from '../org/page-access.js';
import type { ResolvedGrant } from '../types.js';
import { CAPABILITY_ORDER, KitsuneError, quoteIdent } from '../types.js';

/** Matches `[[target]]` or `[[target|alias]]` wiki-link syntax. */
const WIKI_LINK_RE = /\[\[([^\]]+?)\]\]/g;

export interface ParsedWikiLink {
  /** Full inner text before `|`, trimmed. */
  rawTarget: string;
  /** Display alias when `[[target|alias]]`. */
  alias: string | null;
  /** When `[[collection:uuid]]`. */
  collectionHint: string | null;
  recordIdHint: string | null;
}

export interface WikiLinkEdge {
  rawTarget: string;
  toCollectionId: string | null;
  toRecordId: string | null;
  toCollectionName: string | null;
  label: string | null;
}

export interface BacklinkNeighbor {
  collection: string;
  recordId: string;
  label: string | null;
  rawTarget: string;
}

export interface BacklinksResult {
  outgoing: BacklinkNeighbor[];
  incoming: BacklinkNeighbor[];
}

const TITLE_LIKE = ['title', 'name'] as const;
const NOTES_FIRST = 'notes';

function canRead(grant: ResolvedGrant | null): grant is ResolvedGrant {
  return (
    !!grant &&
    CAPABILITY_ORDER.indexOf(grant.capability) >=
      CAPABILITY_ORDER.indexOf('read')
  );
}

/**
 * Strip HTML tags so wiki-links inside TipTap HTML still extract.
 * Also normalizes entities used by the prose editor bridge.
 */
export function proseToPlainText(content: string): string {
  return content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseWikiLinkInner(inner: string): ParsedWikiLink {
  const pipe = inner.indexOf('|');
  const targetPart = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
  const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() || null : null;

  const colon = targetPart.indexOf(':');
  if (colon > 0) {
    const left = targetPart.slice(0, colon).trim();
    const right = targetPart.slice(colon + 1).trim();
    const uuidLike =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        right,
      );
    if (left && uuidLike) {
      return {
        rawTarget: targetPart,
        alias,
        collectionHint: left,
        recordIdHint: right,
      };
    }
  }

  return {
    rawTarget: targetPart,
    alias,
    collectionHint: null,
    recordIdHint: null,
  };
}

/** Extract unique wiki-link targets from markdown/HTML prose. */
export function extractWikiLinks(content: string): ParsedWikiLink[] {
  const plain = proseToPlainText(content);
  const seen = new Set<string>();
  const out: ParsedWikiLink[] = [];
  WIKI_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null = WIKI_LINK_RE.exec(plain);
  while (match) {
    const inner = match[1]?.trim() ?? '';
    if (inner) {
      const parsed = parseWikiLinkInner(inner);
      if (parsed.rawTarget && !seen.has(parsed.rawTarget)) {
        seen.add(parsed.rawTarget);
        out.push(parsed);
      }
    }
    match = WIKI_LINK_RE.exec(plain);
  }
  return out;
}

function titleFieldFor(meta: CollectionMeta): string | null {
  for (const preferred of TITLE_LIKE) {
    if (meta.fieldMeta.some((f) => f.name === preferred)) {
      return preferred;
    }
  }
  return null;
}

async function labelForRecord(
  client: PoolClient,
  schemaName: string,
  meta: CollectionMeta,
  grant: ResolvedGrant,
  recordId: string,
): Promise<string | null> {
  const cols: string[] = [];
  for (const key of TITLE_LIKE) {
    if (!meta.fields.includes(key)) continue;
    try {
      assertFieldAllowed(grant, key, 'read');
      cols.push(key);
    } catch {
      // skip
    }
  }
  if (cols.length === 0) return recordId.slice(0, 8);
  const row = await queryRows<Record<string, unknown>>(
    client,
    `SELECT ${cols.map((c) => quoteIdent(c)).join(', ')}
       FROM ${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)}
      WHERE id = $1 AND _deleted_at IS NULL`,
    [recordId],
  );
  const first = row[0];
  if (!first) return null;
  for (const key of cols) {
    const value = first[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return recordId.slice(0, 8);
}

async function resolveByIdHint(
  client: PoolClient,
  workspaceId: string,
  principalId: string,
  schemaName: string,
  parsed: ParsedWikiLink,
  pool: Pool,
): Promise<WikiLinkEdge | null> {
  if (!parsed.collectionHint || !parsed.recordIdHint) return null;
  let meta: CollectionMeta;
  try {
    meta = await getCollectionMeta(client, workspaceId, parsed.collectionHint);
  } catch {
    return null;
  }
  const grant = await loadResolvedGrant(client, principalId, meta.id);
  if (!canRead(grant)) return null;

  const rows = await queryRows<{ id: string }>(
    client,
    `SELECT id FROM ${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)}
     WHERE id = $1 AND _deleted_at IS NULL`,
    [parsed.recordIdHint],
  );
  if (rows.length === 0) return null;

  if (
    !(await canViewPage(pool, {
      workspaceId,
      collectionId: meta.id,
      recordId: parsed.recordIdHint,
      principalId,
    }))
  ) {
    return null;
  }

  const label = await labelForRecord(
    client,
    schemaName,
    meta,
    grant,
    parsed.recordIdHint,
  );
  return {
    rawTarget: parsed.rawTarget,
    toCollectionId: meta.id,
    toRecordId: parsed.recordIdHint,
    toCollectionName: meta.name,
    label,
  };
}

async function resolveByTitle(
  client: PoolClient,
  workspaceId: string,
  principalId: string,
  schemaName: string,
  title: string,
  pool: Pool,
): Promise<WikiLinkEdge | null> {
  const collections = await queryRows<{
    id: string;
    name: string;
    table_name: string;
  }>(
    client,
    `SELECT id, name, table_name FROM kitsune.collections
      WHERE workspace_id = $1
      ORDER BY CASE WHEN name = $2 THEN 0 ELSE 1 END, name`,
    [workspaceId, NOTES_FIRST],
  );

  for (const col of collections) {
    const meta = await getCollectionMeta(client, workspaceId, col.name);
    const titleField = titleFieldFor(meta);
    if (!titleField) continue;

    const grant = await loadResolvedGrant(client, principalId, meta.id);
    if (!canRead(grant)) continue;
    try {
      assertFieldAllowed(grant, titleField, 'read');
    } catch {
      continue;
    }

    const matches = await queryRows<{ id: string }>(
      client,
      `SELECT id FROM ${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)}
        WHERE _deleted_at IS NULL
          AND lower(${quoteIdent(titleField)}) = lower($1)
        ORDER BY _revision DESC
        LIMIT 20`,
      [title],
    );

    for (const match of matches) {
      if (
        await canViewPage(pool, {
          workspaceId,
          collectionId: meta.id,
          recordId: match.id,
          principalId,
        })
      ) {
        const label = await labelForRecord(
          client,
          schemaName,
          meta,
          grant,
          match.id,
        );
        return {
          rawTarget: title,
          toCollectionId: meta.id,
          toRecordId: match.id,
          toCollectionName: meta.name,
          label: label ?? title,
        };
      }
    }
  }
  return null;
}

export async function resolveWikiLink(
  client: PoolClient,
  pool: Pool,
  workspaceId: string,
  principalId: string,
  schemaName: string,
  parsed: ParsedWikiLink,
): Promise<WikiLinkEdge> {
  if (parsed.collectionHint && parsed.recordIdHint) {
    const byId = await resolveByIdHint(
      client,
      workspaceId,
      principalId,
      schemaName,
      parsed,
      pool,
    );
    if (byId) return byId;
    return {
      rawTarget: parsed.rawTarget,
      toCollectionId: null,
      toRecordId: null,
      toCollectionName: null,
      label: parsed.alias,
    };
  }

  const byTitle = await resolveByTitle(
    client,
    workspaceId,
    principalId,
    schemaName,
    parsed.rawTarget,
    pool,
  );
  if (byTitle) {
    return {
      ...byTitle,
      rawTarget: parsed.rawTarget,
      label: parsed.alias ?? byTitle.label,
    };
  }

  return {
    rawTarget: parsed.rawTarget,
    toCollectionId: null,
    toRecordId: null,
    toCollectionName: null,
    label: parsed.alias ?? parsed.rawTarget,
  };
}

/**
 * Replace all wiki-link edges originating from a record based on its prose fields.
 */
export async function syncPageWikiLinks(
  client: PoolClient,
  pool: Pool,
  workspaceId: string,
  principalId: string,
  schemaName: string,
  collection: string,
  recordId: string,
): Promise<WikiLinkEdge[]> {
  const meta = await getCollectionMeta(client, workspaceId, collection);
  const proseNames = meta.fieldMeta
    .filter((f) => f.type === 'prose')
    .map((f) => f.name);

  let links: ParsedWikiLink[] = [];
  if (proseNames.length > 0) {
    const cols = proseNames.map((n) => quoteIdent(n)).join(', ');
    const rows = await queryRows<Record<string, unknown>>(
      client,
      `SELECT ${cols} FROM ${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)}
       WHERE id = $1 AND _deleted_at IS NULL`,
      [recordId],
    );
    const row = rows[0];
    if (row) {
      const seen = new Set<string>();
      const merged: ParsedWikiLink[] = [];
      for (const name of proseNames) {
        const value = row[name];
        if (typeof value !== 'string' || !value.trim()) continue;
        for (const link of extractWikiLinks(value)) {
          if (!seen.has(link.rawTarget)) {
            seen.add(link.rawTarget);
            merged.push(link);
          }
        }
      }
      links = merged;
    }
  }

  await client.query(
    `DELETE FROM kitsune.page_links
      WHERE workspace_id = $1
        AND from_collection_id = $2
        AND from_record_id = $3`,
    [workspaceId, meta.id, recordId],
  );

  const edges: WikiLinkEdge[] = [];
  for (const parsed of links) {
    const edge = await resolveWikiLink(
      client,
      pool,
      workspaceId,
      principalId,
      schemaName,
      parsed,
    );
    edges.push(edge);
    await client.query(
      `INSERT INTO kitsune.page_links
         (id, workspace_id, from_collection_id, from_record_id,
          to_collection_id, to_record_id, raw_target)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (workspace_id, from_collection_id, from_record_id, raw_target)
       DO UPDATE SET
         to_collection_id = EXCLUDED.to_collection_id,
         to_record_id = EXCLUDED.to_record_id`,
      [
        randomUUID(),
        workspaceId,
        meta.id,
        recordId,
        edge.toCollectionId,
        edge.toRecordId,
        edge.rawTarget,
      ],
    );
  }
  return edges;
}

export async function listBacklinks(
  client: PoolClient,
  pool: Pool,
  workspaceId: string,
  principalId: string,
  schemaName: string,
  collection: string,
  recordId: string,
): Promise<BacklinksResult> {
  const rootMeta = await getCollectionMeta(client, workspaceId, collection);
  const rootGrant = await loadResolvedGrant(client, principalId, rootMeta.id);
  if (!canRead(rootGrant)) {
    throw new KitsuneError('Not found', 'not_found');
  }

  const rootRows = await queryRows<{ id: string }>(
    client,
    `SELECT id FROM ${quoteIdent(schemaName)}.${quoteIdent(rootMeta.tableName)}
     WHERE id = $1 AND _deleted_at IS NULL`,
    [recordId],
  );
  if (rootRows.length === 0) {
    throw new KitsuneError('Not found', 'not_found');
  }

  if (
    !(await canViewPage(pool, {
      workspaceId,
      collectionId: rootMeta.id,
      recordId,
      principalId,
    }))
  ) {
    throw new KitsuneError('Not found', 'not_found');
  }

  const outgoingRows = await queryRows<{
    raw_target: string;
    to_collection_id: string | null;
    to_record_id: string | null;
    to_collection_name: string | null;
  }>(
    client,
    `SELECT pl.raw_target, pl.to_collection_id, pl.to_record_id, c.name AS to_collection_name
       FROM kitsune.page_links pl
       LEFT JOIN kitsune.collections c ON c.id = pl.to_collection_id
      WHERE pl.workspace_id = $1
        AND pl.from_collection_id = $2
        AND pl.from_record_id = $3
      ORDER BY pl.created_at ASC`,
    [workspaceId, rootMeta.id, recordId],
  );

  const incomingRows = await queryRows<{
    raw_target: string;
    from_collection_id: string;
    from_record_id: string;
    from_collection_name: string;
  }>(
    client,
    `SELECT pl.raw_target, pl.from_collection_id, pl.from_record_id, c.name AS from_collection_name
       FROM kitsune.page_links pl
       JOIN kitsune.collections c ON c.id = pl.from_collection_id
      WHERE pl.workspace_id = $1
        AND pl.to_collection_id = $2
        AND pl.to_record_id = $3
      ORDER BY pl.created_at ASC`,
    [workspaceId, rootMeta.id, recordId],
  );

  const outgoing: BacklinkNeighbor[] = [];
  for (const row of outgoingRows) {
    if (!row.to_collection_id || !row.to_record_id || !row.to_collection_name) {
      outgoing.push({
        collection: '',
        recordId: '',
        label: row.raw_target,
        rawTarget: row.raw_target,
      });
      continue;
    }
    if (
      !(await canViewPage(pool, {
        workspaceId,
        collectionId: row.to_collection_id,
        recordId: row.to_record_id,
        principalId,
      }))
    ) {
      continue;
    }
    let label: string | null = row.raw_target;
    try {
      const targetMeta = await getCollectionMeta(
        client,
        workspaceId,
        row.to_collection_name,
      );
      const grant = await loadResolvedGrant(client, principalId, targetMeta.id);
      if (canRead(grant)) {
        label = await labelForRecord(
          client,
          schemaName,
          targetMeta,
          grant,
          row.to_record_id,
        );
      }
    } catch {
      // keep raw
    }
    outgoing.push({
      collection: row.to_collection_name,
      recordId: row.to_record_id,
      label,
      rawTarget: row.raw_target,
    });
  }

  const incoming: BacklinkNeighbor[] = [];
  for (const row of incomingRows) {
    if (
      !(await canViewPage(pool, {
        workspaceId,
        collectionId: row.from_collection_id,
        recordId: row.from_record_id,
        principalId,
      }))
    ) {
      continue;
    }
    let label: string | null = row.from_record_id.slice(0, 8);
    try {
      const sourceMeta = await getCollectionMeta(
        client,
        workspaceId,
        row.from_collection_name,
      );
      const grant = await loadResolvedGrant(client, principalId, sourceMeta.id);
      if (canRead(grant)) {
        label = await labelForRecord(
          client,
          schemaName,
          sourceMeta,
          grant,
          row.from_record_id,
        );
      }
    } catch {
      // keep short id
    }
    incoming.push({
      collection: row.from_collection_name,
      recordId: row.from_record_id,
      label,
      rawTarget: row.raw_target,
    });
  }

  return { outgoing, incoming };
}

/** All resolved wiki-link edges in a workspace visible to the principal. */
export async function listVisibleWikiLinkEdges(
  client: PoolClient,
  pool: Pool,
  workspaceId: string,
  principalId: string,
): Promise<
  Array<{
    fromCollection: string;
    fromRecordId: string;
    toCollection: string;
    toRecordId: string;
    rawTarget: string;
  }>
> {
  const rows = await queryRows<{
    from_collection_id: string;
    from_record_id: string;
    from_collection_name: string;
    to_collection_id: string;
    to_record_id: string;
    to_collection_name: string;
    raw_target: string;
  }>(
    client,
    `SELECT pl.from_collection_id, pl.from_record_id, fc.name AS from_collection_name,
            pl.to_collection_id, pl.to_record_id, tc.name AS to_collection_name,
            pl.raw_target
       FROM kitsune.page_links pl
       JOIN kitsune.collections fc ON fc.id = pl.from_collection_id
       JOIN kitsune.collections tc ON tc.id = pl.to_collection_id
      WHERE pl.workspace_id = $1
        AND pl.to_record_id IS NOT NULL
        AND pl.to_collection_id IS NOT NULL`,
    [workspaceId],
  );

  const out: Array<{
    fromCollection: string;
    fromRecordId: string;
    toCollection: string;
    toRecordId: string;
    rawTarget: string;
  }> = [];

  for (const row of rows) {
    const fromOk = await canViewPage(pool, {
      workspaceId,
      collectionId: row.from_collection_id,
      recordId: row.from_record_id,
      principalId,
    });
    const toOk = await canViewPage(pool, {
      workspaceId,
      collectionId: row.to_collection_id,
      recordId: row.to_record_id,
      principalId,
    });
    if (!fromOk || !toOk) continue;
    out.push({
      fromCollection: row.from_collection_name,
      fromRecordId: row.from_record_id,
      toCollection: row.to_collection_name,
      toRecordId: row.to_record_id,
      rawTarget: row.raw_target,
    });
  }
  return out;
}
