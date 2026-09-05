import type { PoolClient } from 'pg';
import { KitsuneError } from '../types.js';

export type MergeQueueStatus =
  | 'pending'
  | 'processing'
  | 'applied'
  | 'blocked'
  | 'cancelled';

export interface MergeQueueEntry {
  id: string;
  workspaceId: string;
  changeSetId: string;
  enqueuedBy: string;
  status: MergeQueueStatus;
  enqueuedAt: string;
  processedAt: string | null;
  lastError: string | null;
}

export async function insertMergeQueueEntry(
  client: PoolClient,
  input: {
    id: string;
    workspaceId: string;
    changeSetId: string;
    enqueuedBy: string;
  },
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO kitsune.merge_queue
         (id, workspace_id, change_set_id, enqueued_by, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [input.id, input.workspaceId, input.changeSetId, input.enqueuedBy],
    );
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';
    if (code === '23505') {
      throw new KitsuneError(
        'Change set is already in the merge queue',
        'conflict',
      );
    }
    throw error;
  }
}

export async function listMergeQueueEntries(
  client: PoolClient,
  workspaceId: string,
  statuses?: MergeQueueStatus[],
): Promise<MergeQueueEntry[]> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    change_set_id: string;
    enqueued_by: string;
    status: MergeQueueStatus;
    enqueued_at: Date;
    processed_at: Date | null;
    last_error: string | null;
  }>(
    statuses && statuses.length > 0
      ? `SELECT id, workspace_id, change_set_id, enqueued_by, status,
                enqueued_at, processed_at, last_error
           FROM kitsune.merge_queue
          WHERE workspace_id = $1
            AND status = ANY($2::text[])
          ORDER BY enqueued_at ASC, id ASC`
      : `SELECT id, workspace_id, change_set_id, enqueued_by, status,
                enqueued_at, processed_at, last_error
           FROM kitsune.merge_queue
          WHERE workspace_id = $1
          ORDER BY enqueued_at ASC, id ASC`,
    statuses && statuses.length > 0 ? [workspaceId, statuses] : [workspaceId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    changeSetId: row.change_set_id,
    enqueuedBy: row.enqueued_by,
    status: row.status,
    enqueuedAt: row.enqueued_at.toISOString(),
    processedAt: row.processed_at ? row.processed_at.toISOString() : null,
    lastError: row.last_error,
  }));
}

/** Claim the next pending entry for this workspace (skip locked). */
export async function claimNextMergeQueueEntry(
  client: PoolClient,
  workspaceId: string,
): Promise<MergeQueueEntry | null> {
  const result = await client.query<{
    id: string;
    workspace_id: string;
    change_set_id: string;
    enqueued_by: string;
    status: MergeQueueStatus;
    enqueued_at: Date;
    processed_at: Date | null;
    last_error: string | null;
  }>(
    `WITH next AS (
       SELECT id
         FROM kitsune.merge_queue
        WHERE workspace_id = $1
          AND status = 'pending'
        ORDER BY enqueued_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     UPDATE kitsune.merge_queue q
        SET status = 'processing'
       FROM next
      WHERE q.id = next.id
      RETURNING q.id, q.workspace_id, q.change_set_id, q.enqueued_by, q.status,
                q.enqueued_at, q.processed_at, q.last_error`,
    [workspaceId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    changeSetId: row.change_set_id,
    enqueuedBy: row.enqueued_by,
    status: row.status,
    enqueuedAt: row.enqueued_at.toISOString(),
    processedAt: row.processed_at ? row.processed_at.toISOString() : null,
    lastError: row.last_error,
  };
}

export async function completeMergeQueueEntry(
  client: PoolClient,
  entryId: string,
  status: 'applied' | 'blocked' | 'cancelled',
  lastError?: string | null,
): Promise<void> {
  await client.query(
    `UPDATE kitsune.merge_queue
        SET status = $2,
            processed_at = now(),
            last_error = $3
      WHERE id = $1`,
    [entryId, status, lastError ?? null],
  );
}
