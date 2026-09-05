import type { PoolClient } from 'pg';
import { quoteIdent, revTableName } from '../types.js';

export interface SweepCollectionResult {
  collection: string;
  retentionDays: number;
  deleted: number;
}

export interface SweepRevisionsResult {
  collections: SweepCollectionResult[];
  deleted: number;
}

/**
 * Delete revision rows older than each collection's retention window.
 *
 * Null `revision_retention_days` means keep forever (no deletes).
 * Base revisions still referenced by open/blocked change sets are retained
 * so apply can still detect conflicts against those bases.
 */
export async function sweepExpiredRevisions(
  client: PoolClient,
  workspaceId: string,
  schemaName: string,
): Promise<SweepRevisionsResult> {
  const collections = await client.query<{
    id: string;
    name: string;
    table_name: string;
    revision_retention_days: number | null;
  }>(
    `SELECT id, name, table_name, revision_retention_days
       FROM kitsune.collections
      WHERE workspace_id = $1
        AND revision_retention_days IS NOT NULL
        AND revision_retention_days > 0`,
    [workspaceId],
  );

  const results: SweepCollectionResult[] = [];
  let deleted = 0;

  for (const collection of collections.rows) {
    const days = collection.revision_retention_days;
    if (days === null || days <= 0) continue;

    const revTable = `${quoteIdent(schemaName)}.${quoteIdent(
      revTableName(collection.table_name),
    )}`;

    const result = await client.query(
      `DELETE FROM ${revTable} AS rev
        WHERE rev.valid_from < now() - make_interval(days => $1)
          AND NOT EXISTS (
            SELECT 1
              FROM kitsune.change_ops op
              JOIN kitsune.change_sets cs ON cs.id = op.change_set_id
             WHERE op.collection_id = $2
               AND op.record_id = rev.record_id
               AND op.base_revision = rev.revision
               AND cs.status IN ('open', 'blocked')
          )`,
      [days, collection.id],
    );

    const count = result.rowCount ?? 0;
    deleted += count;
    results.push({
      collection: collection.name,
      retentionDays: days,
      deleted: count,
    });
  }

  return { collections: results, deleted };
}
