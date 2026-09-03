import type { AuditQuery } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const body = (await request.json()) as AuditQuery;
    const rows = await engine.queryAudit(
      ctx.workspaceId,
      ctx.principalId,
      body,
    );
    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
