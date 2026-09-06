import { KitsuneError } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import {
  requireWorkspace,
  requireWorkspaceAdmin,
} from '@/lib/require-workspace';

/** List recent deliveries for a webhook endpoint (admin). */
export async function GET(
  request: Request,
  context: { params: Promise<{ endpointId: string }> },
) {
  try {
    const ctx = await requireWorkspace();
    requireWorkspaceAdmin(ctx);
    const { endpointId } = await context.params;
    if (!endpointId?.trim()) {
      throw new KitsuneError('endpointId is required', 'validation');
    }
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get('limit');
    const limit = limitRaw ? Number(limitRaw) : 50;
    const deliveries = await engine.listWebhookDeliveries(
      ctx.workspaceId,
      ctx.principalId,
      endpointId,
      Number.isFinite(limit) ? limit : 50,
    );
    return NextResponse.json({ deliveries });
  } catch (error) {
    return jsonError(error);
  }
}
