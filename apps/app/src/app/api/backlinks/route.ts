import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { requireWorkspace } from '@/lib/require-workspace';

/**
 * Wiki-link backlinks API — outgoing + incoming edges for a page.
 * Visibility: listBacklinks post-filters with canViewPage.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const url = new URL(request.url);
    const collection = url.searchParams.get('collection');
    const recordId = url.searchParams.get('recordId');
    if (!collection || !recordId) {
      return NextResponse.json(
        { error: 'collection and recordId are required' },
        { status: 400 },
      );
    }
    const result = await engine.listBacklinks(
      ctx.workspaceId,
      ctx.principalId,
      collection,
      recordId,
    );
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
