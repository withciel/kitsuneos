import type { JsonValue } from '@kitsuneos/core';
import { upsertPageVisibility } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { resolveRequestAuth } from '@/lib/request-auth';

/** Create a record via directWrite (requires write/admin). */
export async function POST(request: Request) {
  try {
    const ctx = await resolveRequestAuth(request);
    const body = (await request.json()) as {
      collection?: string;
      record?: Record<string, JsonValue>;
      recordId?: string;
      /** Default true: personal creates are private to the creator. */
      private?: boolean;
    };
    if (!body.collection || !body.record) {
      return NextResponse.json(
        { error: 'collection and record are required' },
        { status: 400 },
      );
    }
    const recordId = await engine.directWrite(
      ctx.workspaceId,
      ctx.principalId,
      body.collection,
      body.record,
      body.recordId ? { recordId: body.recordId } : undefined,
    );

    // New pages default to private for the creator (Notion-style personal create).
    const makePrivate = body.private !== false;
    if (makePrivate) {
      const collectionRow = await engine.ownerPool.query<{ id: string }>(
        `SELECT id FROM kitsune.collections
          WHERE workspace_id = $1 AND name = $2`,
        [ctx.workspaceId, body.collection],
      );
      const collectionId = collectionRow.rows[0]?.id;
      if (collectionId) {
        await upsertPageVisibility(engine.ownerPool, {
          workspaceId: ctx.workspaceId,
          collectionId,
          recordId,
          visibility: 'private',
          ownerPrincipalId: ctx.principalId,
          actorPrincipalId: ctx.principalId,
        });
      }
    }

    return NextResponse.json({
      recordId,
      visibility: makePrivate ? 'private' : 'workspace',
    });
  } catch (error) {
    return jsonError(error);
  }
}
