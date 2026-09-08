import { KitsuneError } from '@kitsuneos/core';
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
          // Console share-targets identify teams by principal_id.
          teamId: row.teamPrincipalId,
          ownerPrincipalId: row.ownerPrincipalId,
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

/** Create an agent (admin). */
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
    const principalId = await engine.createPrincipal(
      ctx.workspaceId,
      'agent',
      name,
      {
        agentMembership: membership,
        agentTeamId: membership === 'team' ? body.teamId : undefined,
        agentOwnerPrincipalId:
          membership === 'personal' ? ctx.principalId : undefined,
      },
    );

    // Ensure a durable agent_memory database the agent can write.
    let memoryCollectionId = await engine.findCollectionId(
      ctx.workspaceId,
      'agent_memory',
    );
    if (!memoryCollectionId) {
      memoryCollectionId = await engine.defineCollection(ctx.workspaceId, {
        name: 'agent_memory',
        fields: [
          { name: 'title', type: 'text', nullable: false },
          { name: 'body', type: 'prose' },
        ],
      });
      await engine.createGrant(
        ctx.workspaceId,
        ctx.principalId,
        memoryCollectionId,
        'admin',
        null,
        null,
        { actorId: ctx.principalId },
      );
    }
    await engine.createGrant(
      ctx.workspaceId,
      principalId,
      memoryCollectionId,
      'write',
      null,
      null,
      { actorId: ctx.principalId },
    );

    let apiKeyPlaintext: string | null = null;
    if (body.mintKey !== false) {
      const key = await engine.createApiKey(principalId);
      apiKeyPlaintext = key.plaintext;
    }
    return NextResponse.json(
      {
        agent: {
          id: principalId,
          name,
          membership,
          teamId: membership === 'team' ? (body.teamId ?? null) : null,
          ownerPrincipalId: membership === 'personal' ? ctx.principalId : null,
        },
        apiKeyPlaintext,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
