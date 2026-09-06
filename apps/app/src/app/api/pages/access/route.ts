import type { PageShareCapability, PageVisibility } from '@kitsuneos/core';
import {
  getPageAccess,
  sharePageWithPrincipal,
  unsharePage,
  upsertPageVisibility,
} from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { requireWorkspace } from '@/lib/require-workspace';

async function collectionId(
  workspaceId: string,
  collection: string,
): Promise<string> {
  const row = await engine.ownerPool.query<{ id: string }>(
    `SELECT id FROM kitsune.collections
      WHERE workspace_id = $1 AND name = $2`,
    [workspaceId, collection],
  );
  const id = row.rows[0]?.id;
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
    const access = await getPageAccess(engine.ownerPool, {
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
      await upsertPageVisibility(engine.ownerPool, {
        workspaceId: ctx.workspaceId,
        collectionId: collectionIdValue,
        recordId: body.recordId,
        visibility: body.visibility,
        ownerPrincipalId: ctx.principalId,
        actorPrincipalId: ctx.principalId,
      });
    }
    if (body.share?.principalId) {
      await sharePageWithPrincipal(engine.ownerPool, {
        workspaceId: ctx.workspaceId,
        collectionId: collectionIdValue,
        recordId: body.recordId,
        granteePrincipalId: body.share.principalId,
        capability: body.share.capability ?? 'read',
        actorPrincipalId: ctx.principalId,
      });
    }
    if (body.unsharePrincipalId) {
      await unsharePage(engine.ownerPool, {
        workspaceId: ctx.workspaceId,
        collectionId: collectionIdValue,
        recordId: body.recordId,
        granteePrincipalId: body.unsharePrincipalId,
        actorPrincipalId: ctx.principalId,
      });
    }

    const access = await getPageAccess(engine.ownerPool, {
      workspaceId: ctx.workspaceId,
      collectionId: collectionIdValue,
      recordId: body.recordId,
    });
    return NextResponse.json({ access });
  } catch (error) {
    return jsonError(error);
  }
}
