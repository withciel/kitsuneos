import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { resolveRequestAuth } from '@/lib/request-auth';

export async function GET(
  request: Request,
  context: { params: Promise<{ changeSetId: string }> },
) {
  try {
    const ctx = await resolveRequestAuth(request);
    const { changeSetId } = await context.params;
    const comments = await engine.listChangeSetComments(
      ctx.workspaceId,
      ctx.principalId,
      changeSetId,
    );
    return NextResponse.json({ comments });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ changeSetId: string }> },
) {
  try {
    const ctx = await resolveRequestAuth(request);
    const { changeSetId } = await context.params;
    const body = (await request.json()) as { body?: string };
    const result = await engine.addChangeSetComment(
      ctx.workspaceId,
      ctx.principalId,
      changeSetId,
      body.body ?? '',
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
