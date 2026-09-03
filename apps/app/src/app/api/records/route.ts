import type { JsonValue } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { requireWorkspace } from '@/lib/require-workspace';

/** Create a record via directWrite (requires write/admin). */
export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const body = (await request.json()) as {
      collection?: string;
      record?: Record<string, JsonValue>;
      recordId?: string;
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
    return NextResponse.json({ recordId });
  } catch (error) {
    return jsonError(error);
  }
}
