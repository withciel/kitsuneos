import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store' };

/**
 * Resolve (or create) the workspace assistant agent principal.
 * Connect keys must belong to this principal so MCP writes become Changes proposals
 * instead of acting with the signed-in human's write/admin grants.
 */
async function resolveAssistantPrincipal(
  workspaceId: string,
  actorPrincipalId: string,
): Promise<string> {
  const existing = await engine.findAssistantPrincipalId(workspaceId);
  const assistantId =
    existing ??
    (await engine.createPrincipal(workspaceId, 'agent', 'assistant'));

  const collectionIds = await engine.listCollectionIds(workspaceId);
  for (const collectionId of collectionIds) {
    const hasGrant = await engine.hasActiveGrant({
      workspaceId,
      principalId: assistantId,
      collectionId,
    });
    if (hasGrant) continue;
    await engine.createGrant(
      workspaceId,
      assistantId,
      collectionId,
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
    await engine.revokeApiKeysForPrincipal(assistantId);
    const apiKey = await engine.createApiKey(assistantId);
    await engine.clearPendingApiKey(ctx.userId);
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
