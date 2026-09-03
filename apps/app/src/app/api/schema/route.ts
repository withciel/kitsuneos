import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

export async function GET() {
  try {
    const ctx = await requireWorkspace();
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
