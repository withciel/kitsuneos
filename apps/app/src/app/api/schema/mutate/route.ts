import type { FieldDefinition, SchemaChangeOp } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { resolveRequestAuth } from '@/lib/request-auth';

export async function POST(request: Request) {
  try {
    const ctx = await resolveRequestAuth(request);
    const body = (await request.json()) as {
      collection?: string;
      op?: SchemaChangeOp;
      fieldName?: string;
      field?: FieldDefinition;
      indexed?: boolean;
      confirmStaleIds?: string[];
    };
    if (!body.collection || !body.op) {
      return NextResponse.json(
        { error: 'collection and op are required' },
        { status: 400 },
      );
    }

    const input = {
      collection: body.collection,
      op: body.op,
      fieldName: body.fieldName,
      field: body.field,
      indexed: body.indexed,
    };

    const preview = await engine.previewSchemaChange(
      ctx.workspaceId,
      ctx.principalId,
      input,
    );

    const stale = preview.incompatibleChangeSetIds;
    if (stale.length > 0) {
      const confirmed = body.confirmStaleIds;
      if (!confirmed) {
        return NextResponse.json(
          {
            preview,
            requiresConfirmation: true,
            error:
              'Schema change would stale open change sets; pass confirmStaleIds to proceed',
          },
          { status: 409 },
        );
      }
      const confirmedSet = new Set(confirmed);
      if (
        stale.length !== confirmed.length ||
        stale.some((id) => !confirmedSet.has(id))
      ) {
        return NextResponse.json(
          {
            preview,
            requiresConfirmation: true,
            error:
              'confirmStaleIds must exactly match incompatibleChangeSetIds',
          },
          { status: 409 },
        );
      }
    }

    const result = await engine.applySchemaChange(
      ctx.workspaceId,
      ctx.principalId,
      {
        ...input,
        confirmStaleIds: body.confirmStaleIds ?? [],
      },
    );

    return NextResponse.json({ ...result, preview });
  } catch (error) {
    return jsonError(error);
  }
}
