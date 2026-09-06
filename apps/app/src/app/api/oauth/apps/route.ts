import {
  createOAuthApp,
  KitsuneError,
  listOAuthApps,
  revokeOAuthApp,
} from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import {
  requireWorkspace,
  requireWorkspaceAdmin,
} from '@/lib/require-workspace';

/** List OAuth apps that can use this workspace as a database. */
export async function GET() {
  try {
    const ctx = await requireWorkspace();
    requireWorkspaceAdmin(ctx);
    const apps = await listOAuthApps(engine.ownerPool, ctx.workspaceId);
    return NextResponse.json({ apps });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Register an OAuth application.
 * Creates a service principal that can define collections (Kitsune-as-DB).
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    requireWorkspaceAdmin(ctx);
    const body = (await request.json()) as {
      name?: string;
      redirectUris?: string[];
    };
    const name = body.name?.trim();
    if (!name) {
      throw new KitsuneError('App name is required', 'validation');
    }

    const principalId = await engine.createPrincipal(
      ctx.workspaceId,
      'service',
      `OAuth app: ${name}`,
    );

    const created = await createOAuthApp(engine.ownerPool, {
      workspaceId: ctx.workspaceId,
      name,
      redirectUris: body.redirectUris ?? [],
      principalId,
      createdBy: ctx.principalId,
    });

    // Service principal may create databases and write records in this workspace.
    // defineCollection is owner-path; grant admin on future collections via wildcard
    // is not supported — apps create DBs through /api/collections as this principal,
    // and the route grants the creator admin on the new collection.
    return NextResponse.json(
      {
        app: created.app,
        clientSecret: created.clientSecret,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireWorkspace();
    requireWorkspaceAdmin(ctx);
    const url = new URL(request.url);
    const appId = url.searchParams.get('appId');
    if (!appId) {
      throw new KitsuneError('appId is required', 'validation');
    }
    await revokeOAuthApp(engine.ownerPool, {
      workspaceId: ctx.workspaceId,
      appId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
