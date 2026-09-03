// workspace-lint: ignore — workspace from requireWorkspace; SQL uses kitsune.grants.workspace_id.

import type { Capability, Predicate } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import {
  requireWorkspace,
  type WorkspaceContext,
} from '@/lib/require-workspace';

async function requireAdmin(ctx: WorkspaceContext): Promise<void> {
  const schema = await engine.describeSchema(ctx.workspaceId, ctx.principalId);
  if (
    !schema.collections.some((collection) => collection.capability === 'admin')
  ) {
    throw new Error('Not found');
  }
}

export async function GET() {
  try {
    const ctx = await requireWorkspace();
    await requireAdmin(ctx);
    const grants = await engine.listGrants(ctx.workspaceId, ctx.principalId);
    const principals = await engine.ownerPool.query<{
      id: string;
      display_name: string;
      kind: string;
    }>(
      `SELECT id, display_name, kind FROM kitsune.principals
        WHERE workspace_id = $1 ORDER BY display_name`,
      [ctx.workspaceId],
    );
    const collections = await engine.ownerPool.query<{
      id: string;
      name: string;
    }>(
      `SELECT id, name FROM kitsune.collections
        WHERE workspace_id = $1 ORDER BY name`,
      [ctx.workspaceId],
    );
    return NextResponse.json({
      grants,
      principals: principals.rows,
      collections: collections.rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized')
      ? 401
      : message.includes('Not found')
        ? 404
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
      adminOverrideAgentWrite?: boolean;
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
        adminOverrideAgentWrite: body.adminOverrideAgentWrite,
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
