// workspace-lint: ignore — workspace from requireWorkspace; SQL uses kitsune.workspace_memberships.workspace_id.

import type { WorkspaceRole } from '@kitsuneos/core';
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
    throw new Error('Only workspace admins can manage people');
  }
}

export async function GET() {
  try {
    const ctx = await requireWorkspace();
    await requireAdmin(ctx);
    const people = await engine.listWorkspaceMemberships(ctx.workspaceId);
    return NextResponse.json({ people });
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
      email?: string;
      role?: WorkspaceRole;
      displayName?: string;
    };
    if (!body.email?.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const role: WorkspaceRole =
      body.role === 'admin' || body.role === 'member' ? body.role : 'member';
    const result = await engine.invitePerson(ctx.workspaceId, ctx.userId, {
      email: body.email,
      role,
      displayName: body.displayName,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
