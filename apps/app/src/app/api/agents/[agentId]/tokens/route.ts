import {
  createApiKey,
  KitsuneError,
  revokeApiKeysForPrincipal,
} from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import {
  requireWorkspace,
  requireWorkspaceAdmin,
} from '@/lib/require-workspace';

type Params = { params: Promise<{ agentId: string }> };

/** Mint a fresh API token for an agent (revokes prior keys). */
export async function POST(_request: Request, { params }: Params) {
  try {
    const ctx = await requireWorkspace();
    requireWorkspaceAdmin(ctx);
    const { agentId } = await params;
    const agent = await engine.ownerPool.query<{ id: string }>(
      `SELECT id FROM kitsune.principals
        WHERE id = $1
          AND workspace_id = $2
          AND kind = 'agent'
          AND disabled_at IS NULL`,
      [agentId, ctx.workspaceId],
    );
    if (!agent.rows[0]) {
      throw new KitsuneError('Agent not found', 'not_found');
    }
    await revokeApiKeysForPrincipal(engine.ownerPool, agentId);
    const key = await createApiKey(engine.ownerPool, agentId);
    return NextResponse.json({
      agentId,
      apiKeyPlaintext: key.plaintext,
      prefix: key.prefix,
    });
  } catch (error) {
    return jsonError(error);
  }
}
