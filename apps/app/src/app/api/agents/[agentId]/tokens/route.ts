import { KitsuneError } from '@kitsuneos/core';
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
    const agent = await engine.getAgent(ctx.workspaceId, agentId);
    if (!agent) {
      throw new KitsuneError('Agent not found', 'not_found');
    }
    await engine.revokeApiKeysForPrincipal(agentId);
    const key = await engine.createApiKey(agentId);
    return NextResponse.json({
      agentId,
      apiKeyPlaintext: key.plaintext,
      prefix: key.prefix,
    });
  } catch (error) {
    return jsonError(error);
  }
}
