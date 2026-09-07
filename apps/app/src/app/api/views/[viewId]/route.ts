import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { resolveRequestAuth } from '@/lib/request-auth';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ viewId: string }> },
) {
  try {
    const ctx = await resolveRequestAuth(request);
    const { viewId } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      config?: Record<string, unknown>;
      position?: number;
    };
    const view = await engine.updateView(
      ctx.workspaceId,
      ctx.principalId,
      viewId,
      body,
    );
    return NextResponse.json({ view });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Forbidden')
      ? 403
      : message.includes('Not found')
        ? 404
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ viewId: string }> },
) {
  try {
    const request = _request;
    const ctx = await resolveRequestAuth(request);
    const { viewId } = await context.params;
    await engine.deleteView(ctx.workspaceId, ctx.principalId, viewId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Forbidden')
      ? 403
      : message.includes('Not found')
        ? 404
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
