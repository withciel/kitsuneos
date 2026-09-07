import type { CollectionDefinition } from '@kitsuneos/core';
import { validateCollectionDefinition } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { resolveRequestAuth } from '@/lib/request-auth';

export async function POST(request: Request) {
  try {
    const ctx = await resolveRequestAuth(request);
    if (
      ctx.authKind === 'oauth' &&
      !(ctx.scopes ?? []).includes('databases:create')
    ) {
      return NextResponse.json(
        { error: 'OAuth token missing databases:create scope' },
        { status: 403 },
      );
    }
    const body = (await request.json()) as CollectionDefinition & {
      scope?: 'workspace' | 'personal';
    };
    validateCollectionDefinition(body);
    const scope = body.scope === 'personal' ? 'personal' : 'workspace';
    const collectionId = await engine.defineCollection(ctx.workspaceId, {
      ...body,
      scope,
      ownerPrincipalId:
        scope === 'personal' ? ctx.principalId : body.ownerPrincipalId,
    });
    // Creator must see the collection — defineCollection only creates DDL/metadata.
    await engine.createGrant(
      ctx.workspaceId,
      ctx.principalId,
      collectionId,
      'admin',
      null,
      null,
      { actorId: ctx.principalId },
    );
    return NextResponse.json({ collectionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
