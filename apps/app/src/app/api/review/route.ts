// workspace-lint: ignore — workspace resolved via requireWorkspace(); SQL uses kitsune schema column names.

import type { JsonValue } from '@kitsuneos/core';
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
      summaries.push({
        id: cs.id,
        title: cs.title,
        rationale: cs.rationale,
        status: cs.status,
        createdAt: cs.created_at.toISOString(),
        author: cs.author,
        operations: ops.rows.map((o) => ({
          id: o.id,
          collection: o.collection,
          recordId: o.record_id,
          op: o.op,
          fieldName: o.field_name,
          newValue: o.new_value,
          status: o.status,
          seq: o.seq,
        })),
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
