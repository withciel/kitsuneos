import type { PageShareCapability, PageVisibility } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { requireWorkspace } from '@/lib/require-workspace';

async function collectionId(
  workspaceId: string,
  collection: string,
): Promise<string> {
  const id = await engine.findCollectionId(workspaceId, collection);
  if (!id) {
    throw new Error(`Collection not found: ${collection}`);
  }
  return id;
}

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
    const access = await engine.getPageAccessState({
      workspaceId: ctx.workspaceId,
      collectionId: await collectionId(ctx.workspaceId, collection),
      recordId,
    });
    return NextResponse.json({
      access: access ?? {
        visibility: 'workspace',
        ownerPrincipalId: ctx.principalId,
        shares: [],
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const body = (await request.json()) as {
      collection?: string;
      recordId?: string;
      visibility?: PageVisibility;
      share?: {
        principalId: string;
        capability?: PageShareCapability;
      };
      unsharePrincipalId?: string;
    };
    if (!body.collection || !body.recordId) {
      return NextResponse.json(
        { error: 'collection and recordId are required' },
        { status: 400 },
      );
    }
    const collectionIdValue = await collectionId(
      ctx.workspaceId,
      body.collection,
    );

    if (body.visibility) {
      await engine.upsertPageVisibility({
        workspaceId: ctx.workspaceId,
        collectionId: collectionIdValue,
        recordId: body.recordId,
        visibility: body.visibility,
        ownerPrincipalId: ctx.principalId,
        actorPrincipalId: ctx.principalId,
      });
    }
    if (body.share?.principalId) {
      await engine.sharePageWithPrincipal({
        workspaceId: ctx.workspaceId,
        collectionId: collectionIdValue,
        recordId: body.recordId,
        granteePrincipalId: body.share.principalId,
        capability: body.share.capability ?? 'read',
        actorPrincipalId: ctx.principalId,
      });
    }
    if (body.unsharePrincipalId) {
      await engine.unsharePage({
        workspaceId: ctx.workspaceId,
        collectionId: collectionIdValue,
        recordId: body.recordId,
        granteePrincipalId: body.unsharePrincipalId,
        actorPrincipalId: ctx.principalId,
      });
    }

    const access = await engine.getPageAccessState({
      workspaceId: ctx.workspaceId,
      collectionId: collectionIdValue,
      recordId: body.recordId,
    });
    return NextResponse.json({ access });
  } catch (error) {
    return jsonError(error);
  }
}
