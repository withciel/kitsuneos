import type { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import type { JsonValue } from '../types.js';

export interface AuditEntry {
  workspaceId: string;
  principalId: string;
  action: string;
  collectionId?: string;
  recordIds?: string[];
  fieldNames?: string[];
  outcome: 'allowed' | 'denied';
  reason?: string;
  detail?: Record<string, JsonValue>;
}

export async function writeAudit(pool: Pool, entry: AuditEntry): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO kitsune.audit_log
        (id, workspace_id, principal_id, action, collection_id, record_ids, field_names, outcome, reason, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        uuidv4(),
        entry.workspaceId,
        entry.principalId,
        entry.action,
        entry.collectionId ?? null,
        entry.recordIds ?? null,
        entry.fieldNames ?? null,
        entry.outcome,
        entry.reason ?? null,
        entry.detail ? JSON.stringify(entry.detail) : null,
      ],
    );
  } finally {
    client.release();
  }
}

export async function writeAuditInTxn(
  client: PoolClient,
  entry: AuditEntry,
): Promise<void> {
  await client.query(
    `INSERT INTO kitsune.audit_log
      (id, workspace_id, principal_id, action, collection_id, record_ids, field_names, outcome, reason, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      uuidv4(),
      entry.workspaceId,
      entry.principalId,
      entry.action,
      entry.collectionId ?? null,
      entry.recordIds ?? null,
      entry.fieldNames ?? null,
      entry.outcome,
      entry.reason ?? null,
      entry.detail ? JSON.stringify(entry.detail) : null,
    ],
  );
}
