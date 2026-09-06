import { KitsuneError } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import {
  requireWorkspace,
  requireWorkspaceAdmin,
} from '@/lib/require-workspace';

/** Delete a webhook endpoint (admin). */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ endpointId: string }> },
) {
  try {
    const ctx = await requireWorkspace();
    requireWorkspaceAdmin(ctx);
    const { endpointId } = await context.params;
    if (!endpointId?.trim()) {
      throw new KitsuneError('endpointId is required', 'validation');
    }
    await engine.deleteWebhookEndpoint(
      ctx.workspaceId,
      ctx.principalId,
      endpointId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
