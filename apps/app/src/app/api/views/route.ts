import type { CollectionViewConfig, CollectionViewType } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { resolveRequestAuth } from '@/lib/request-auth';

const VIEW_TYPES = new Set<CollectionViewType>([
  'table',
  'board',
  'list',
  'gallery',
  'calendar',
]);

/** List views for a collection (Table view is auto-created if missing). */
export async function GET(request: Request) {
  try {
    const ctx = await resolveRequestAuth(request);
    const url = new URL(request.url);
    const collection = url.searchParams.get('collection')?.trim() ?? '';
    if (!collection) {
      throw new KitsuneError(
        'collection query param is required',
        'validation',
      );
    }
    const views = await engine.listViews(
      ctx.workspaceId,
      ctx.principalId,
      collection,
    );
    return NextResponse.json({ views });
  } catch (error) {
    return jsonError(error);
  }
}

/** Create a new view (Board / List / Gallery / Calendar) for a collection. */
export async function POST(request: Request) {
  try {
    const ctx = await resolveRequestAuth(request);
    const body = (await request.json()) as {
      collection?: string;
      name?: string;
      type?: string;
      config?: CollectionViewConfig;
    };
    const collection = body.collection?.trim() ?? '';
    const type = body.type as CollectionViewType | undefined;
    if (!collection || !type || !VIEW_TYPES.has(type)) {
      throw new KitsuneError(
        'collection and a valid type are required',
        'validation',
      );
    }
    const view = await engine.createView(
      ctx.workspaceId,
      ctx.principalId,
      collection,
      {
        name: body.name?.trim() || type,
        type,
        config: body.config,
      },
    );
    return NextResponse.json({ view }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
