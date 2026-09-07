import type { CollectionViewConfig } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { resolveRequestAuth } from '@/lib/request-auth';

/** Rename a view, update its config (groupBy / dateField / hiddenColumns…), or reorder it. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ viewId: string }> },
) {
  try {
    const ctx = await resolveRequestAuth(request);
    const { viewId } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      config?: CollectionViewConfig;
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
    return jsonError(error);
  }
}

/** Delete a view (the default Table view cannot be deleted; engine enforces this). */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ viewId: string }> },
) {
  try {
    const ctx = await resolveRequestAuth(request);
    const { viewId } = await context.params;
    await engine.deleteView(ctx.workspaceId, ctx.principalId, viewId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
