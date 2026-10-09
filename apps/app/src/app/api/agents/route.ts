import { KitsuneError } from '@kitsuneos/core';
import { createAgentViaWorkOS } from '@kitsuneos/provisioning';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import {
  isWorkspaceAdmin,
  requireWorkspace,
  requireWorkspaceAdmin,
} from '@/lib/require-workspace';

/**
 * List agents in the active workspace, with membership scope.
 * Personal agents owned by someone else are hidden from non-admins.
 */
export async function GET() {
  try {
    const ctx = await requireWorkspace();
    const [agents, mcpUsed] = await Promise.all([
      engine.listAgents(ctx.workspaceId),
      engine.hasMcpStreamableUsage(ctx.workspaceId),
    ]);
    const admin = isWorkspaceAdmin(ctx.role);
    return NextResponse.json({
      mcpUsed,
      agents: agents
        .map((row) => ({
          id: row.id,
          name: row.displayName,
          createdAt: row.createdAt,
          activeKeyCount: row.keyCount,
          hasUsedKey: row.hasUsedKey,
          membership: row.membership ?? 'workspace',
          teamId: row.teamPrincipalId,
          ownerPrincipalId: row.ownerPrincipalId,
          workosAgentInstanceId: row.workosAgentInstanceId,
        }))
        .filter(
          (agent) =>
            admin ||
            agent.membership !== 'personal' ||
            agent.ownerPrincipalId === ctx.principalId,
        ),
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** Create an agent (admin) — WorkOS Agent Auth + FGA resource when configured. */
export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    requireWorkspaceAdmin(ctx);
    const body = (await request.json()) as {
      name?: string;
      mintKey?: boolean;
      membership?: 'workspace' | 'team' | 'personal';
      teamId?: string;
    };
    const name = body.name?.trim();
    if (!name) {
      throw new KitsuneError('Agent name is required', 'validation');
    }
    const membership = body.membership ?? 'workspace';
    const created = await createAgentViaWorkOS(engine, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      actorPrincipalId: ctx.principalId,
      name,
      membership,
      teamId: membership === 'team' ? body.teamId : undefined,
      mintKitsuneKey: body.mintKey !== false,
    });

    return NextResponse.json(
      {
        agent: {
          id: created.principalId,
          name,
          membership,
          teamId: membership === 'team' ? (body.teamId ?? null) : null,
          ownerPrincipalId: membership === 'personal' ? ctx.principalId : null,
          workosAgentInstanceId: created.workosAgentInstanceId,
        },
        apiKeyPlaintext: created.apiKeyPlaintext,
        workosAccessToken: created.workosAccessToken,
        workosRefreshToken: created.workosRefreshToken,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
