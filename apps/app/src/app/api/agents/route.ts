import { createApiKey, KitsuneError } from '@kitsuneos/core';
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
    const agents = await engine.ownerPool.query<{
      id: string;
      display_name: string;
      created_at: string;
      key_count: string;
      agent_membership: string | null;
      agent_team_principal_id: string | null;
      agent_owner_principal_id: string | null;
    }>(
      `SELECT p.id, p.display_name, p.created_at::text AS created_at,
              count(k.id) FILTER (WHERE k.revoked_at IS NULL)::text AS key_count,
              p.agent_membership,
              t.principal_id AS agent_team_principal_id,
              p.agent_owner_principal_id
         FROM kitsune.principals p
         LEFT JOIN kitsune.api_keys k ON k.principal_id = p.id
         LEFT JOIN kitsune.teams t ON t.id = p.agent_team_id
        WHERE p.workspace_id = $1
          AND p.kind = 'agent'
          AND p.disabled_at IS NULL
        GROUP BY p.id, t.principal_id
        ORDER BY p.created_at ASC`,
      [ctx.workspaceId],
    );
    const admin = isWorkspaceAdmin(ctx.role);
    return NextResponse.json({
      agents: agents.rows
        .map((row) => ({
          id: row.id,
          name: row.display_name,
          createdAt: row.created_at,
          activeKeyCount: Number(row.key_count),
          membership: row.agent_membership ?? 'workspace',
          // Console share-targets identify teams by principal_id.
          teamId: row.agent_team_principal_id,
          ownerPrincipalId: row.agent_owner_principal_id,
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
    const existingMemory = await engine.ownerPool.query<{ id: string }>(
      `SELECT id FROM kitsune.collections
        WHERE workspace_id = $1 AND name = 'agent_memory'`,
      [ctx.workspaceId],
    );
    let memoryCollectionId = existingMemory.rows[0]?.id;
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
      const key = await createApiKey(engine.ownerPool, principalId);
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
