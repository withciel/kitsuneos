import { KitsuneError } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { isWorkspaceAdmin, requireWorkspace } from '@/lib/require-workspace';

type Params = { params: Promise<{ agentId: string }> };

/** Agent profile: identity, membership, active grants (admin-visible). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const ctx = await requireWorkspace();
    const { agentId } = await params;
    const row = await engine.getAgent(ctx.workspaceId, agentId);
    if (!row) {
      throw new KitsuneError('Agent not found', 'not_found');
    }
    const admin = isWorkspaceAdmin(ctx.role);
    const isOwner = row.ownerPrincipalId === ctx.principalId;
    if (row.membership === 'personal' && !admin && !isOwner) {
      throw new KitsuneError('Agent not found', 'not_found');
    }

    const canManageAccess = admin;
    const grants = canManageAccess
      ? await engine.listPrincipalGrants(ctx.workspaceId, agentId)
      : [];

    return NextResponse.json({
      agent: {
        id: row.id,
        name: row.displayName,
        createdAt: row.createdAt,
        activeKeyCount: row.keyCount,
        membership: row.membership ?? 'workspace',
        teamId: row.teamPrincipalId,
        ownerPrincipalId: row.ownerPrincipalId,
      },
      canManageAccess,
      grants,
    });
  } catch (error) {
    return jsonError(error);
  }
}
