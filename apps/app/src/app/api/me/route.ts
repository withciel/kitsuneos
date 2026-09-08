import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import {
  consumePendingApiKey,
  requireWorkspace,
} from '@/lib/require-workspace';

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const ctx = await requireWorkspace();
    const pendingRaw =
      ctx.apiKeyPlaintext ?? (await consumePendingApiKey(ctx.userId));

    let connectKeyPlaintext: string | null = null;
    if (pendingRaw) {
      try {
        const resolved = await engine.resolveApiKey(pendingRaw);
        const assistantId = await engine.findAssistantPrincipalId(
          ctx.workspaceId,
        );
        if (assistantId && resolved.principalId === assistantId) {
          connectKeyPlaintext = pendingRaw;
        } else {
          // Legacy human pending keys must not appear as Connect assistant keys.
          await engine.revokeApiKeysForPrincipal(resolved.principalId);
        }
      } catch {
        // Invalid/stale pending value — ignore for Connect.
      }
    }

    const [assistantKeyCount, email] = await Promise.all([
      engine.countActiveAssistantKeys(ctx.workspaceId),
      engine.getUserEmail(ctx.userId),
    ]);
    const hasApiKey = Boolean(connectKeyPlaintext) || assistantKeyCount > 0;
    return NextResponse.json(
      {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        principalId: ctx.principalId,
        role: ctx.role,
        email,
        apiKeyPlaintext: connectKeyPlaintext,
        hasApiKey,
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
