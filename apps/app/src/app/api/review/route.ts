import type { ReviewDecision } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { requireWorkspace } from '@/lib/require-workspace';

export async function GET(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const url = new URL(request.url);
    const scopeParam = url.searchParams.get('scope') ?? 'open';
    const scope =
      scopeParam === 'all' || scopeParam === 'closed' || scopeParam === 'open'
        ? scopeParam
        : 'open';
    const authorId = url.searchParams.get('authorId');

    const changeSets = await engine.listChangeSetSummaries(
      ctx.workspaceId,
      ctx.principalId,
      { scope, authorId },
    );

    return NextResponse.json(
      { changeSets },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const body = (await request.json()) as {
      changeSetId?: string;
      action?: string;
      decisions?: ReviewDecision[];
      apply?: boolean;
    };
    if (!body.changeSetId) {
      return NextResponse.json(
        { error: 'changeSetId is required' },
        { status: 400 },
      );
    }

    let decisions = body.decisions ?? [];
    if (
      decisions.length === 0 &&
      (body.action === 'approve' || body.action === 'reject')
    ) {
      const opIds = await engine.listChangeSetOpIds(
        ctx.workspaceId,
        body.changeSetId,
      );
      decisions = opIds.map((opId) => ({
        opId,
        status: body.action === 'approve' ? 'approved' : 'rejected',
      }));
    }

    if (decisions.length > 0) {
      await engine.reviewChangeSet(
        ctx.workspaceId,
        ctx.principalId,
        body.changeSetId,
        decisions,
      );
    }

    if (body.apply === true) {
      if (
        await engine.changeSetHasProposedOps(ctx.workspaceId, body.changeSetId)
      ) {
        return NextResponse.json(
          {
            error:
              'Cannot apply while operations remain proposed. Decide every operation first.',
          },
          { status: 400 },
        );
      }
      const result = await engine.applyChangeSet(
        ctx.workspaceId,
        ctx.principalId,
        body.changeSetId,
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ status: 'reviewed' });
  } catch (error) {
    return jsonError(error);
  }
}
