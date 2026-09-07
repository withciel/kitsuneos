import { NextResponse } from 'next/server';
import type { CollectionViewType } from '@kitsuneos/core';
import { engine } from '@/lib/engine';
import { resolveRequestAuth } from '@/lib/request-auth';

export async function GET(request: Request) {
  try {
    const ctx = await resolveRequestAuth(request);
    const url = new URL(request.url);
    const collection = url.searchParams.get('collection');
    if (!collection) {
      return NextResponse.json(
        { error: 'collection query param is required' },
        { status: 400 },
      );
    }
    const views = await engine.listViews(
      ctx.workspaceId,
      ctx.principalId,
      collection,
    );
    return NextResponse.json({ views });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Unauthorized')
      ? 401
      : message.includes('Forbidden')
        ? 403
        : message.includes('Not found')
          ? 404
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await resolveRequestAuth(request);
    const body = (await request.json()) as {
      collection?: string;
      name?: string;
      type?: CollectionViewType;
      config?: Record<string, unknown>;
    };
    if (!body.collection || !body.type) {
      return NextResponse.json(
        { error: 'collection and type are required' },
        { status: 400 },
      );
    }
    const view = await engine.createView(
      ctx.workspaceId,
      ctx.principalId,
      body.collection,
      {
        name: body.name?.trim() || body.type,
        type: body.type,
        config: body.config,
      },
    );
    return NextResponse.json({ view });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
