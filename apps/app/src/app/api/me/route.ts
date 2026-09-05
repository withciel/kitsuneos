import { NextResponse } from 'next/server';
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
    return NextResponse.json(
      {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        apiKeyPlaintext: pending,
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
