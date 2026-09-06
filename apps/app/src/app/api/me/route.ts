import { resolveApiKey } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import {
  consumePendingApiKey,
  requireWorkspace,
} from '@/lib/require-workspace';

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store' };

async function assistantPrincipalId(
  workspaceId: string,
): Promise<string | null> {
  const result = await engine.ownerPool.query<{ id: string }>(
    `SELECT id FROM kitsune.principals
      WHERE workspace_id = $1
        AND kind = 'agent'
        AND display_name = 'assistant'
        AND disabled_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1`,
    [workspaceId],
  );
  return result.rows[0]?.id ?? null;
}

export async function GET() {
  try {
    const ctx = await requireWorkspace();
    const pendingRaw =
      ctx.apiKeyPlaintext ?? (await consumePendingApiKey(ctx.userId));

    let connectKeyPlaintext: string | null = null;
    if (pendingRaw) {
      try {
        const resolved = await resolveApiKey(engine.ownerPool, pendingRaw);
        const assistantId = await assistantPrincipalId(ctx.workspaceId);
        if (assistantId && resolved.principalId === assistantId) {
          connectKeyPlaintext = pendingRaw;
        } else {
          // Legacy human pending keys must not appear as Connect assistant keys.
          await engine.ownerPool.query(
            `UPDATE kitsune.api_keys
                SET revoked_at = now()
              WHERE principal_id = $1 AND revoked_at IS NULL`,
            [resolved.principalId],
          );
        }
      } catch {
        // Invalid/stale pending value — ignore for Connect.
      }
    }

    const [assistantKeyCount, userRow] = await Promise.all([
      engine.ownerPool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM kitsune.api_keys k
           JOIN kitsune.principals p ON p.id = k.principal_id
          WHERE p.workspace_id = $1
            AND p.kind = 'agent'
            AND p.display_name = 'assistant'
            AND p.disabled_at IS NULL
            AND k.revoked_at IS NULL`,
        [ctx.workspaceId],
      ),
      engine.ownerPool.query<{ email: string }>(
        `SELECT email FROM kitsune.users WHERE id = $1`,
        [ctx.userId],
      ),
    ]);
    const hasApiKey =
      Boolean(connectKeyPlaintext) ||
      Number(assistantKeyCount.rows[0]?.count ?? '0') > 0;
    return NextResponse.json(
      {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        role: ctx.role,
        email: userRow.rows[0]?.email ?? null,
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
