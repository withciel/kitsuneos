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
    const pending =
      ctx.apiKeyPlaintext ?? (await consumePendingApiKey(ctx.userId));
    const [keyCount, userRow] = await Promise.all([
      engine.ownerPool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM kitsune.api_keys
          WHERE principal_id = $1 AND revoked_at IS NULL`,
        [ctx.principalId],
      ),
      engine.ownerPool.query<{ email: string }>(
        `SELECT email FROM kitsune.users WHERE id = $1`,
        [ctx.userId],
      ),
    ]);
    const hasApiKey =
      Boolean(pending) || Number(keyCount.rows[0]?.count ?? '0') > 0;
    return NextResponse.json(
      {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        email: userRow.rows[0]?.email ?? null,
        apiKeyPlaintext: pending,
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
