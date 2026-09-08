import type { PoolClient } from 'pg';
import { compilePageAccessPredicate } from '../compiler/page-access-sql.js';
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

  // Root page ACL: a collection grant alone must not reveal neighbors of a
  // private root the principal cannot view (not-found, never forbidden).
  const rootPageAcl = await compilePageAccessPredicate(client, {
    workspaceId,
    collectionId: rootMeta.id,
    principalId,
    rootAlias: 'r',
    paramStart: 2,
  });

  const rootRows = await queryRows<{ id: string }>(
    client,
    `SELECT id FROM ${quoteIdent(schemaName)}.${quoteIdent(rootMeta.tableName)} r
     WHERE r.id = $1 AND r._deleted_at IS NULL
       AND ${rootPageAcl.sql}`,
    [recordId, ...rootPageAcl.params],
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

    // Compile page_access into the neighbor join so private target rows
    // (including their label field) are never selected — no post-filter.
    const targetPageAcl = await compilePageAccessPredicate(client, {
      workspaceId,
      collectionId: targetMeta.id,
      principalId,
      rootAlias: 't',
      paramStart: 2,
    });

    const fkRows = await queryRows<Record<string, unknown>>(
      client,
      `SELECT ${selectCols}
         FROM ${quoteIdent(schemaName)}.${quoteIdent(rootMeta.tableName)} r
         INNER JOIN ${quoteIdent(schemaName)}.${quoteIdent(targetMeta.tableName)} t
           ON t.id = r.${quoteIdent(field.name)}
        WHERE r.id = $1 AND r._deleted_at IS NULL AND t._deleted_at IS NULL
          AND ${targetPageAcl.sql}`,
      [recordId, ...targetPageAcl.params],
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
        'n.id::text AS id',
        ...labels.map((c) => `n.${quoteIdent(c)} AS ${quoteIdent(c)}`),
      ].join(', ');

      // Compile page_access for the referencing row so a private page never
      // surfaces as an incoming edge — no post-filter.
      const otherPageAcl = await compilePageAccessPredicate(client, {
        workspaceId,
        collectionId: otherMeta.id,
        principalId,
        rootAlias: 'n',
        paramStart: 2,
      });

      const rows = await queryRows<Record<string, unknown>>(
        client,
        `SELECT ${selectCols}
           FROM ${quoteIdent(schemaName)}.${quoteIdent(otherMeta.tableName)} n
          WHERE n.${quoteIdent(field.name)} = $1 AND n._deleted_at IS NULL
            AND ${otherPageAcl.sql}
          LIMIT 100`,
        [recordId, ...otherPageAcl.params],
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
