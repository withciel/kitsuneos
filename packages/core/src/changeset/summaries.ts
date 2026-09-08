import type { Pool } from 'pg';
import type { JsonValue } from '../types.js';

export type ChangeSetListScope = 'open' | 'closed' | 'all';

export interface ChangeSetOperationSummary {
  id: string;
  collection: string;
  recordId: string | null;
  op: string;
  fieldName: string | null;
  newValue: JsonValue;
  before: JsonValue | null;
  status: string;
  seq: number;
  reviewComment?: string | null;
}

export interface ChangeSetSummary {
  id: string;
  title: string | null;
  rationale: string | null;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
  author: string;
  authorId: string;
  conflictCount: number;
  conflictedFields: string[];
  operations: ChangeSetOperationSummary[];
}

const CLOSED_STATUSES = ['applied', 'rejected', 'expired', 'stale', 'blocked'];

export interface ListChangeSetSummariesInput {
  workspaceId: string;
  /** When set, loads `before` via this reader (grant-aware). */
  readBefore?: (
    collection: string,
    recordId: string,
    fieldName: string,
  ) => Promise<JsonValue | null>;
  scope?: ChangeSetListScope;
  authorId?: string | null;
  /** When set, return only this change set (still scoped to workspace). */
  changeSetId?: string | null;
  /** Include review_comment on operations (CLI). Default false. */
  includeReviewComments?: boolean;
}

/**
 * List change-set summaries for the Changes surface / CLI review.
 * Control-plane SQL stays inside core; adapters never touch ownerPool.
 */
export async function listChangeSetSummaries(
  ownerPool: Pool,
  input: ListChangeSetSummariesInput,
): Promise<ChangeSetSummary[]> {
  const scope = input.scope ?? (input.changeSetId ? 'all' : 'open');
  // Fixed SQL only — filters are parameters, never string-interpolated clauses.
  const changeSets = await ownerPool.query<{
    id: string;
    title: string | null;
    rationale: string | null;
    status: string;
    created_at: Date;
    decided_at: Date | null;
    expires_at: Date | null;
    author: string;
    author_id: string;
    conflict_count: number;
    conflicted_fields: string[];
  }>(
    `SELECT cs.id, cs.title, cs.rationale, cs.status, cs.created_at,
            cs.decided_at, cs.expires_at, cs.conflict_count,
            cs.conflicted_fields, cs.author_id, p.display_name AS author
       FROM kitsune.change_sets cs
       JOIN kitsune.principals p ON p.id = cs.author_id
      WHERE cs.workspace_id = $1
        AND ($2::uuid IS NULL OR cs.id = $2)
        AND (
          $2::uuid IS NOT NULL
          OR $3::text = 'all'
          OR ($3 = 'open' AND cs.status = 'open')
          OR ($3 = 'closed' AND cs.status = ANY($4::text[]))
        )
        AND ($5::uuid IS NULL OR cs.author_id = $5)
      ORDER BY cs.created_at DESC`,
    [
      input.workspaceId,
      input.changeSetId ?? null,
      scope,
      CLOSED_STATUSES,
      input.authorId ?? null,
    ],
  );

  const summaries: ChangeSetSummary[] = [];
  for (const cs of changeSets.rows) {
    const ops = await ownerPool.query<{
      id: string;
      collection: string;
      record_id: string | null;
      op: string;
      field_name: string | null;
      new_value: JsonValue;
      status: string;
      seq: number;
      review_comment: string | null;
    }>(
      `SELECT o.id, c.name AS collection, o.record_id, o.op, o.field_name,
              o.new_value, o.status, o.seq, o.review_comment
         FROM kitsune.change_ops o
         JOIN kitsune.collections c ON c.id = o.collection_id
        WHERE o.change_set_id = $1
        ORDER BY o.seq`,
      [cs.id],
    );

    const operations: ChangeSetOperationSummary[] = [];
    for (const o of ops.rows) {
      let before: JsonValue | null = null;
      if (
        input.readBefore &&
        o.op !== 'insert' &&
        o.record_id &&
        o.field_name
      ) {
        before = await input.readBefore(
          o.collection,
          o.record_id,
          o.field_name,
        );
      }
      operations.push({
        id: o.id,
        collection: o.collection,
        recordId: o.record_id,
        op: o.op,
        fieldName: o.field_name,
        newValue: o.new_value,
        before,
        status: o.status,
        seq: o.seq,
        ...(input.includeReviewComments
          ? { reviewComment: o.review_comment }
          : {}),
      });
    }

    summaries.push({
      id: cs.id,
      title: cs.title,
      rationale: cs.rationale,
      status: cs.status,
      createdAt: cs.created_at.toISOString(),
      decidedAt: cs.decided_at ? cs.decided_at.toISOString() : null,
      expiresAt: cs.expires_at ? cs.expires_at.toISOString() : null,
      author: cs.author,
      authorId: cs.author_id,
      conflictCount: cs.conflict_count,
      conflictedFields: cs.conflicted_fields ?? [],
      operations,
    });
  }

  return summaries;
}

/** Op ids for a change set in a workspace (approve/reject-all). */
export async function listChangeSetOpIds(
  ownerPool: Pool,
  workspaceId: string,
  changeSetId: string,
): Promise<string[]> {
  const result = await ownerPool.query<{ id: string }>(
    `SELECT o.id
       FROM kitsune.change_ops o
       JOIN kitsune.change_sets cs ON cs.id = o.change_set_id
      WHERE o.change_set_id = $1 AND cs.workspace_id = $2
      ORDER BY o.seq`,
    [changeSetId, workspaceId],
  );
  return result.rows.map((row) => row.id);
}

/** True when any op is still `proposed` (apply must wait). */
export async function changeSetHasProposedOps(
  ownerPool: Pool,
  workspaceId: string,
  changeSetId: string,
): Promise<boolean> {
  const result = await ownerPool.query<{ status: string }>(
    `SELECT o.status
       FROM kitsune.change_ops o
       JOIN kitsune.change_sets cs ON cs.id = o.change_set_id
      WHERE o.change_set_id = $1 AND cs.workspace_id = $2`,
    [changeSetId, workspaceId],
  );
  return result.rows.some((row) => row.status === 'proposed');
}
