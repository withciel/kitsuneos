// workspace-lint: ignore — workspace resolved via requireWorkspace(); SQL uses kitsune schema column names.

import type { JsonValue, ReviewDecision } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

interface ChangeSetSummary {
  id: string;
  title: string | null;
  rationale: string | null;
  status: string;
  createdAt: string;
  author: string;
  operations: OperationSummary[];
}

interface OperationSummary {
  id: string;
  collection: string;
  recordId: string | null;
  op: string;
  fieldName: string | null;
  newValue: JsonValue;
  before: JsonValue | null;
  status: string;
  seq: number;
}

export async function GET() {
  try {
    const ctx = await requireWorkspace();
    const changeSets = await engine.ownerPool.query<{
      id: string;
      title: string | null;
      rationale: string | null;
      status: string;
      created_at: Date;
      author: string;
    }>(
      `SELECT cs.id, cs.title, cs.rationale, cs.status, cs.created_at,
              p.display_name AS author
         FROM kitsune.change_sets cs
         JOIN kitsune.principals p ON p.id = cs.author_id
        WHERE cs.workspace_id = $1 AND cs.status = 'open'
        ORDER BY cs.created_at`,
      [ctx.workspaceId],
    );

    const summaries: ChangeSetSummary[] = [];
    for (const cs of changeSets.rows) {
      const ops = await engine.ownerPool.query<{
        id: string;
        collection: string;
        record_id: string | null;
        op: string;
        field_name: string | null;
        new_value: JsonValue;
        status: string;
        seq: number;
      }>(
        `SELECT o.id, c.name AS collection, o.record_id, o.op, o.field_name,
                o.new_value, o.status, o.seq
           FROM kitsune.change_ops o
           JOIN kitsune.collections c ON c.id = o.collection_id
          WHERE o.change_set_id = $1
          ORDER BY o.seq`,
        [cs.id],
      );
      const operations: OperationSummary[] = [];
      for (const o of ops.rows) {
        let before: JsonValue | null = null;
        if (o.op !== 'insert' && o.record_id && o.field_name) {
          const record = await engine.readRecord(
            ctx.workspaceId,
            ctx.principalId,
            o.collection,
            o.record_id,
            [o.field_name],
          );
          before = record?.[o.field_name] ?? null;
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
        });
      }
      summaries.push({
        id: cs.id,
        title: cs.title,
        rationale: cs.rationale,
        status: cs.status,
        createdAt: cs.created_at.toISOString(),
        author: cs.author,
        operations,
      });
    }

    return NextResponse.json(
      { changeSets: summaries },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json(
      { error: message },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const body = (await request.json()) as {
      changeSetId?: string;
      action?: string;
      decisions?: ReviewDecision[];
      apply?: boolean;
    };
    if (!body.changeSetId) {
      return NextResponse.json(
        { error: 'changeSetId is required' },
        { status: 400 },
      );
    }

    let decisions = body.decisions ?? [];
    if (
      decisions.length === 0 &&
      (body.action === 'approve' || body.action === 'reject')
    ) {
      const ops = await engine.ownerPool.query<{ id: string }>(
        `SELECT o.id
           FROM kitsune.change_ops o
           JOIN kitsune.change_sets cs ON cs.id = o.change_set_id
          WHERE o.change_set_id = $1 AND cs.workspace_id = $2`,
        [body.changeSetId, ctx.workspaceId],
      );
      decisions = ops.rows.map((op) => ({
        opId: op.id,
        status: body.action === 'approve' ? 'approved' : 'rejected',
      }));
    }

    if (decisions.length > 0) {
      await engine.reviewChangeSet(
        ctx.workspaceId,
        ctx.principalId,
        body.changeSetId,
        decisions,
      );
    }

    if (body.apply === true) {
      const remaining = await engine.ownerPool.query<{ status: string }>(
        `SELECT o.status
           FROM kitsune.change_ops o
           JOIN kitsune.change_sets cs ON cs.id = o.change_set_id
          WHERE o.change_set_id = $1 AND cs.workspace_id = $2`,
        [body.changeSetId, ctx.workspaceId],
      );
      if (remaining.rows.some((row) => row.status === 'proposed')) {
        return NextResponse.json(
          {
            error:
              'Cannot apply while operations remain proposed. Decide every operation first.',
          },
          { status: 400 },
        );
      }
      const result = await engine.applyChangeSet(
        ctx.workspaceId,
        ctx.principalId,
        body.changeSetId,
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ status: 'reviewed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
