import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { requireWorkspace } from '@/lib/require-workspace';

/** Current plan, limits, and usage for the active workspace. */
export async function GET() {
  try {
    const ctx = await requireWorkspace();
    const snapshot = await engine.loadPlanUsage(ctx.workspaceId, ctx.userId);
    return NextResponse.json(snapshot);
  } catch (error) {
    return jsonError(error);
  }
}
