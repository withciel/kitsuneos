import { ensureNotesCollection } from '@kitsuneos/provisioning';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { resolveRequestAuth } from '@/lib/request-auth';

export async function GET(request: Request) {
  try {
    const ctx = await resolveRequestAuth(request);
    // Backfill personal notes for workspaces provisioned before notes shipped.
    if (ctx.authKind === 'session') {
      await ensureNotesCollection(engine, ctx.workspaceId, ctx.principalId);
    }
    const schema = await engine.describeSchema(
      ctx.workspaceId,
      ctx.principalId,
    );
    return NextResponse.json(schema, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
