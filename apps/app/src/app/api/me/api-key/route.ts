import { createApiKey, revokeApiKeysForPrincipal } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store' };

/**
 * Resolve (or create) the workspace assistant agent principal.
 * Connect keys must belong to this principal so MCP writes become Inbox proposals
 * instead of acting with the signed-in human's write/admin grants.
 */
async function resolveAssistantPrincipal(
  workspaceId: string,
  actorPrincipalId: string,
): Promise<string> {
  const existing = await engine.ownerPool.query<{ id: string }>(
    `SELECT id FROM kitsune.principals
      WHERE workspace_id = $1
        AND kind = 'agent'
        AND display_name = 'assistant'
        AND disabled_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1`,
    [workspaceId],
  );
  const assistantId =
    existing.rows[0]?.id ??
    (await engine.createPrincipal(workspaceId, 'agent', 'assistant'));

  const collections = await engine.ownerPool.query<{ id: string }>(
    `SELECT id FROM kitsune.collections WHERE workspace_id = $1`,
    [workspaceId],
  );
  for (const collection of collections.rows) {
    const grant = await engine.ownerPool.query<{ id: string }>(
      `SELECT id FROM kitsune.grants
        WHERE workspace_id = $1
          AND principal_id = $2
          AND collection_id = $3
          AND revoked_at IS NULL
        LIMIT 1`,
      [workspaceId, assistantId, collection.id],
    );
    if (grant.rows[0]) continue;
    await engine.createGrant(
      workspaceId,
      assistantId,
      collection.id,
      'propose',
      null,
      null,
      { actorId: actorPrincipalId },
    );
  }
  return assistantId;
}

/** Mint a Connect AI key for the assistant agent (propose-only). */
export async function POST() {
  try {
    const ctx = await requireWorkspace();
    const assistantId = await resolveAssistantPrincipal(
      ctx.workspaceId,
      ctx.principalId,
    );
    await revokeApiKeysForPrincipal(engine.ownerPool, assistantId);
    const apiKey = await createApiKey(engine.ownerPool, assistantId);
    await engine.ownerPool.query(
      `UPDATE kitsune.users SET pending_api_key = NULL WHERE id = $1`,
      [ctx.userId],
    );
    return NextResponse.json(
      {
        apiKeyPlaintext: apiKey.plaintext,
        prefix: apiKey.prefix,
        principalId: assistantId,
        principalKind: 'agent',
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json(
      { error: message },
      { status, headers: PRIVATE_HEADERS },
    );
  }
}
