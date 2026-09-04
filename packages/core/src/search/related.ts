import type { PoolClient } from 'pg';
import { type CollectionMeta, getCollectionMeta } from '../compiler/query.js';
import { queryRows } from '../db/pool.js';
import { assertFieldAllowed, loadResolvedGrant } from '../grants/resolve.js';
import type { ResolvedGrant } from '../types.js';
import { CAPABILITY_ORDER, KitsuneError, quoteIdent } from '../types.js';

export interface RelatedNeighbor {
  field: string;
  collection: string;
  recordId: string;
  label: string | null;
}

export interface RelatedResult {
  outgoing: RelatedNeighbor[];
  incoming: RelatedNeighbor[];
}

function canRead(grant: ResolvedGrant | null): grant is ResolvedGrant {
  return (
    !!grant &&
    CAPABILITY_ORDER.indexOf(grant.capability) >=
      CAPABILITY_ORDER.indexOf('read')
  );
}

function labelColumns(grant: ResolvedGrant, fieldNames: string[]): string[] {
  const preferred = ['name', 'title', 'email'];
  const selected: string[] = [];
  for (const key of preferred) {
    if (!fieldNames.includes(key)) continue;
    try {
      assertFieldAllowed(grant, key, 'read');
      selected.push(key);
    } catch {
      // skip
    }
  }
  return selected;
}

function pickLabel(
  row: Record<string, unknown>,
  columns: string[],
): string | null {
  for (const key of columns) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return typeof row.id === 'string' ? row.id.slice(0, 8) : null;
}

export async function listRelatedRecords(
  client: PoolClient,
  workspaceId: string,
  principalId: string,
  schemaName: string,
  collection: string,
  recordId: string,
): Promise<RelatedResult> {
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

  const outgoing: RelatedNeighbor[] = [];
  for (const field of rootMeta.fieldMeta) {
    if (field.type !== 'relation' || !field.relationTarget) continue;
    try {
      assertFieldAllowed(rootGrant, field.name, 'read');
    } catch {
      continue;
    }

    const targetName = field.relationTarget;
    let targetMeta: CollectionMeta;
    try {
      targetMeta = await getCollectionMeta(client, workspaceId, targetName);
    } catch {
      continue;
    }
    const targetGrant = await loadResolvedGrant(
      client,
      principalId,
      targetMeta.id,
    );
    if (!canRead(targetGrant)) continue;

    const labels = labelColumns(
      targetGrant,
      targetMeta.fieldMeta.map((f) => f.name),
    );
    const selectCols = [
      't.id::text AS id',
      ...labels.map((c) => `t.${quoteIdent(c)} AS ${quoteIdent(c)}`),
    ].join(', ');

    const fkRows = await queryRows<Record<string, unknown>>(
      client,
      `SELECT ${selectCols}
         FROM ${quoteIdent(schemaName)}.${quoteIdent(rootMeta.tableName)} r
         INNER JOIN ${quoteIdent(schemaName)}.${quoteIdent(targetMeta.tableName)} t
           ON t.id = r.${quoteIdent(field.name)}
        WHERE r.id = $1 AND r._deleted_at IS NULL AND t._deleted_at IS NULL`,
      [recordId],
    );
    for (const row of fkRows) {
      outgoing.push({
        field: field.name,
        collection: targetName,
        recordId: String(row.id),
        label: pickLabel(row, labels),
      });
    }
  }

  const incoming: RelatedNeighbor[] = [];
  const allCollections = await queryRows<{
    id: string;
    name: string;
    table_name: string;
  }>(
    client,
    `SELECT id, name, table_name FROM kitsune.collections WHERE workspace_id = $1`,
    [workspaceId],
  );

  for (const other of allCollections) {
    if (other.name === collection) continue;
    const otherGrant = await loadResolvedGrant(client, principalId, other.id);
    if (!canRead(otherGrant)) continue;

    let otherMeta: CollectionMeta;
    try {
      otherMeta = await getCollectionMeta(client, workspaceId, other.name);
    } catch {
      continue;
    }

    for (const field of otherMeta.fieldMeta) {
      if (field.type !== 'relation' || field.relationTarget !== collection) {
        continue;
      }
      try {
        assertFieldAllowed(otherGrant, field.name, 'read');
      } catch {
        continue;
      }

      const labels = labelColumns(
        otherGrant,
        otherMeta.fieldMeta.map((f) => f.name),
      );
      const selectCols = [
        'id::text AS id',
        ...labels.map((c) => `${quoteIdent(c)} AS ${quoteIdent(c)}`),
      ].join(', ');

      const rows = await queryRows<Record<string, unknown>>(
        client,
        `SELECT ${selectCols}
           FROM ${quoteIdent(schemaName)}.${quoteIdent(otherMeta.tableName)}
          WHERE ${quoteIdent(field.name)} = $1 AND _deleted_at IS NULL
          LIMIT 100`,
        [recordId],
      );
      for (const row of rows) {
        incoming.push({
          field: field.name,
          collection: other.name,
          recordId: String(row.id),
          label: pickLabel(row, labels),
        });
      }
    }
  }

  return { outgoing, incoming };
}
