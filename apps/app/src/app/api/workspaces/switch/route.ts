import { KitsuneError, switchActiveWorkspace } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const body = (await request.json()) as { workspaceId?: string };
    if (!body.workspaceId || typeof body.workspaceId !== 'string') {
      throw new KitsuneError('workspaceId is required', 'validation');
    }
    const membership = await switchActiveWorkspace(engine.ownerPool, {
      userId: ctx.userId,
      workspaceId: body.workspaceId,
    });
    return NextResponse.json(
      {
        workspaceId: membership.workspaceId,
        workspaceName: membership.workspaceName,
        role: membership.role,
        principalId: membership.principalId,
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    let status = 400;
    if (error instanceof KitsuneError) {
      if (error.code === 'forbidden') status = 403;
      if (error.code === 'validation') status = 400;
    }
    return NextResponse.json(
      { error: message },
      { status, headers: PRIVATE_HEADERS },
    );
  }
}
