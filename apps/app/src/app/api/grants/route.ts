// workspace-lint: ignore — workspace from requireWorkspace; SQL uses kitsune.grants.workspace_id.

import type { Capability, Predicate } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import {
  requireWorkspace,
  requireWorkspaceAdmin,
  type WorkspaceContext,
} from '@/lib/require-workspace';

function requireAdmin(ctx: WorkspaceContext): void {
  requireWorkspaceAdmin(ctx);
}

export async function GET() {
  try {
    const ctx = await requireWorkspace();
    await requireAdmin(ctx);
    const grants = await engine.listGrants(ctx.workspaceId, ctx.principalId);
    const [principals, collections] = await Promise.all([
      engine.listWorkspacePrincipals(ctx.workspaceId),
      engine.listWorkspaceCollectionNames(ctx.workspaceId),
    ]);
    return NextResponse.json({
      grants,
      principals,
      collections,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized')
      ? 401
      : message.includes('Only workspace admins')
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    await requireAdmin(ctx);
    const body = (await request.json()) as {
      principalId?: string;
      collectionId?: string;
      capability?: Capability;
      fieldMask?: string[] | null;
      rowPredicate?: Predicate | null;
    };
    if (!body.principalId || !body.collectionId || !body.capability) {
      return NextResponse.json(
        { error: 'Missing grant fields' },
        { status: 400 },
      );
    }
    const grantId = await engine.createGrant(
      ctx.workspaceId,
      body.principalId,
      body.collectionId,
      body.capability,
      body.fieldMask ?? null,
      body.rowPredicate ?? null,
      {
        actorId: ctx.principalId,
      },
    );
    return NextResponse.json({ grantId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await requireWorkspace();
    await requireAdmin(ctx);
    const body = (await request.json()) as { grantId?: string };
    if (!body.grantId) {
      return NextResponse.json(
        { error: 'grantId is required' },
        { status: 400 },
      );
    }
    await engine.revokeGrant(body.grantId, ctx.principalId, ctx.workspaceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
