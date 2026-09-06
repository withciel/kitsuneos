import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { resolveRequestAuth } from '@/lib/request-auth';

export async function POST(request: Request) {
  try {
    const ctx = await resolveRequestAuth(request);
    const body = (await request.json()) as {
      collection?: string;
      recordId?: string;
      limit?: number;
      beforeRevision?: number;
    };
    if (!body.collection || !body.recordId) {
      return NextResponse.json(
        { error: 'collection and recordId are required' },
        { status: 400 },
      );
    }
    const result = await engine.listRecordRevisions(
      ctx.workspaceId,
      ctx.principalId,
      body.collection,
      body.recordId,
      { limit: body.limit ?? 50, beforeRevision: body.beforeRevision },
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
