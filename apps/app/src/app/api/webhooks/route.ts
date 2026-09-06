import { KitsuneError } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import {
  requireWorkspace,
  requireWorkspaceAdmin,
} from '@/lib/require-workspace';

/** List webhook endpoints (admin). Secrets are never returned. */
export async function GET() {
  try {
    const ctx = await requireWorkspace();
    requireWorkspaceAdmin(ctx);
    const endpoints = await engine.listWebhookEndpoints(
      ctx.workspaceId,
      ctx.principalId,
    );
    return NextResponse.json({ endpoints });
  } catch (error) {
    return jsonError(error);
  }
}

/** Create a webhook endpoint (admin). Secret returned once. */
export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    requireWorkspaceAdmin(ctx);
    const body = (await request.json()) as {
      url?: string;
      events?: string[];
    };
    const url = body.url?.trim() ?? '';
    if (!url) {
      throw new KitsuneError('url is required', 'validation');
    }
    const created = await engine.createWebhookEndpoint(
      ctx.workspaceId,
      ctx.principalId,
      {
        url,
        events: body.events,
      },
    );
    return NextResponse.json(
      {
        endpoint: {
          id: created.id,
          url,
          events: body.events ?? ['change_set.applied'],
        },
        secret: created.secret,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
