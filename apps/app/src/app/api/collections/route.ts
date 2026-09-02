import type { CollectionDefinition } from '@kitsuneos/core';
import { validateCollectionDefinition } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const body = (await request.json()) as CollectionDefinition;
    validateCollectionDefinition(body);
    const collectionId = await engine.defineCollection(ctx.workspaceId, body);
    return NextResponse.json({ collectionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
