import type { PoolClient } from 'pg';
import { quoteIdent, revTableName } from '../types.js';

export async function writeRevision(
  client: PoolClient,
  schemaName: string,
  tableName: string,
  recordId: string,
  revision: number,
  snapshot: Record<string, unknown>,
  changedFields: string[],
  principalId: string,
  changeSetId: string | null,
): Promise<void> {
  const revTable = `${quoteIdent(schemaName)}.${quoteIdent(revTableName(tableName))}`;
  await client.query(
    `INSERT INTO ${revTable}
      (record_id, revision, snapshot, changed_fields, change_set_id, principal_id, valid_from)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [
      recordId,
      revision,
      JSON.stringify(snapshot),
      changedFields,
      changeSetId,
      principalId,
    ],
  );
}

export async function getRevisionSnapshot(
  client: PoolClient,
  schemaName: string,
  tableName: string,
  recordId: string,
  revision: number,
): Promise<Record<string, unknown> | null> {
  const revTable = `${quoteIdent(schemaName)}.${quoteIdent(revTableName(tableName))}`;
  const result = await client.query<{ snapshot: Record<string, unknown> }>(
    `SELECT snapshot FROM ${revTable}
     WHERE record_id = $1 AND revision = $2`,
    [recordId, revision],
  );
  return result.rows[0]?.snapshot ?? null;
}

export async function getRevisionAtTime(
  client: PoolClient,
  schemaName: string,
  tableName: string,
  recordId: string,
  at: string,
): Promise<{
  snapshot: Record<string, unknown>;
  revision: number;
} | null> {
  const revTable = `${quoteIdent(schemaName)}.${quoteIdent(revTableName(tableName))}`;
  const result = await client.query<{
    snapshot: Record<string, unknown>;
    revision: string;
  }>(
    `SELECT snapshot, revision FROM ${revTable}
     WHERE record_id = $1 AND valid_from <= $2::timestamptz
     ORDER BY revision DESC
     LIMIT 1`,
    [recordId, at],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return { snapshot: row.snapshot, revision: Number(row.revision) };
}

export async function getChangedFieldsSince(
  client: PoolClient,
  schemaName: string,
  tableName: string,
  recordId: string,
  afterRevision: number,
): Promise<string[]> {
  const revTable = `${quoteIdent(schemaName)}.${quoteIdent(revTableName(tableName))}`;
  const result = await client.query<{ changed_fields: string[] }>(
    `SELECT changed_fields FROM ${revTable}
     WHERE record_id = $1 AND revision > $2
     ORDER BY revision ASC`,
    [recordId, afterRevision],
  );
  const all = new Set<string>();
  for (const row of result.rows) {
    for (const field of row.changed_fields) {
      all.add(field);
    }
  }
  return [...all];
}
