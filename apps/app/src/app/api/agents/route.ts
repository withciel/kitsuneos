import { createApiKey, KitsuneError } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import {
  requireWorkspace,
  requireWorkspaceAdmin,
} from '@/lib/require-workspace';

/** List agents in the active workspace. */
export async function GET() {
  try {
    const ctx = await requireWorkspace();
    const agents = await engine.ownerPool.query<{
      id: string;
      display_name: string;
      created_at: string;
      key_count: string;
    }>(
      `SELECT p.id, p.display_name, p.created_at::text AS created_at,
              count(k.id) FILTER (WHERE k.revoked_at IS NULL)::text AS key_count
         FROM kitsune.principals p
         LEFT JOIN kitsune.api_keys k ON k.principal_id = p.id
        WHERE p.workspace_id = $1
          AND p.kind = 'agent'
          AND p.disabled_at IS NULL
        GROUP BY p.id
        ORDER BY p.created_at ASC`,
      [ctx.workspaceId],
    );
    return NextResponse.json({
      agents: agents.rows.map((row) => ({
        id: row.id,
        name: row.display_name,
        createdAt: row.created_at,
        activeKeyCount: Number(row.key_count),
      })),
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
    };
    const name = body.name?.trim();
    if (!name) {
      throw new KitsuneError('Agent name is required', 'validation');
    }
    const principalId = await engine.createPrincipal(
      ctx.workspaceId,
      'agent',
      name,
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
      { adminOverrideAgentWrite: true, actorId: ctx.principalId },
    );

    let apiKeyPlaintext: string | null = null;
    if (body.mintKey !== false) {
      const key = await createApiKey(engine.ownerPool, principalId);
      apiKeyPlaintext = key.plaintext;
    }
    return NextResponse.json(
      {
        agent: { id: principalId, name },
        apiKeyPlaintext,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
