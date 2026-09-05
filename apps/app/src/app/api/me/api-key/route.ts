import { createApiKey, revokeApiKeysForPrincipal } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

const PRIVATE_HEADERS = { 'Cache-Control': 'no-store' };

/** Mint a new console API key; revokes prior keys for this principal. */
export async function POST() {
  try {
    const ctx = await requireWorkspace();
    await revokeApiKeysForPrincipal(engine.ownerPool, ctx.principalId);
    const apiKey = await createApiKey(engine.ownerPool, ctx.principalId);
    await engine.ownerPool.query(
      `UPDATE kitsune.users SET pending_api_key = NULL WHERE id = $1`,
      [ctx.userId],
    );
    return NextResponse.json(
      {
        apiKeyPlaintext: apiKey.plaintext,
        prefix: apiKey.prefix,
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
