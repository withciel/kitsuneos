import { KitsuneError, listMembershipsForUser } from '@kitsuneos/core';
import { createAdditionalWorkspaceForUser } from '@kitsuneos/provisioning';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const ctx = await requireWorkspace();
    const memberships = await listMembershipsForUser(
      engine.ownerPool,
      ctx.userId,
    );
    const active = memberships.find((m) => m.workspaceId === ctx.workspaceId);
    return NextResponse.json(
      {
        activeWorkspaceId: ctx.workspaceId,
        activeWorkspaceName: active?.workspaceName ?? null,
        role: ctx.role,
        memberships: memberships.map((m) => ({
          workspaceId: m.workspaceId,
          workspaceName: m.workspaceName,
          role: m.role,
          principalId: m.principalId,
          active: m.workspaceId === ctx.workspaceId,
        })),
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error instanceof KitsuneError && error.code === 'forbidden' ? 401 : 400;
    return NextResponse.json(
      { error: message },
      { status, headers: PRIVATE_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      activate?: boolean;
    };
    const emailRow = await engine.ownerPool.query<{ email: string }>(
      `SELECT email FROM kitsune.users WHERE id = $1`,
      [ctx.userId],
    );
    const email = emailRow.rows[0]?.email;
    if (!email) {
      throw new KitsuneError('User email missing', 'internal');
    }
    const created = await createAdditionalWorkspaceForUser(engine, {
      userId: ctx.userId,
      email,
      name: body.name,
      activate: body.activate !== false,
    });
    return NextResponse.json(
      {
        workspaceId: created.workspaceId,
        workspaceName: created.workspaceName,
        principalId: created.principalId,
        activated: body.activate !== false,
      },
      { status: 201, headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error instanceof KitsuneError && error.code === 'forbidden' ? 403 : 400;
    return NextResponse.json(
      { error: message },
      { status, headers: PRIVATE_HEADERS },
    );
  }
}
