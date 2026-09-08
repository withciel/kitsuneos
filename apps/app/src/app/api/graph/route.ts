import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { requireWorkspace } from '@/lib/require-workspace';

/**
 * Graph distribution API — nodes/edges for linked-page views and exporters.
 *
 * Visibility: engine.query / engine.readRecord / engine.listRelated /
 * engine.listWikiLinkEdges all compile page_access into SQL (or evaluate the
 * same compilePageAccessPredicate fragment). This route does not re-check ACL.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const url = new URL(request.url);
    const focusCollection = url.searchParams.get('collection');
    const focusRecordId = url.searchParams.get('recordId');
    const depthParam = Number(url.searchParams.get('depth') ?? '1');
    const maxDepth = Math.min(
      3,
      Math.max(1, Number.isFinite(depthParam) ? depthParam : 1),
    );

    const schema = await engine.describeSchema(
      ctx.workspaceId,
      ctx.principalId,
    );
    const collections = schema.collections ?? [];

    const nodes: Array<{ id: string; collection: string; label: string }> = [];
    const edges: Array<{ from: string; to: string; field: string }> = [];
    const seen = new Set<string>();

    async function addRecord(
      collection: string,
      recordId: string,
      remaining: number,
    ) {
      const key = `${collection}:${recordId}`;
      if (seen.has(key)) {
        return;
      }
      const record = await engine.readRecord(
        ctx.workspaceId,
        ctx.principalId,
        collection,
        recordId,
      );
      if (!record) return;
      seen.add(key);
      const label =
        (typeof record.title === 'string' && record.title) ||
        (typeof record.name === 'string' && record.name) ||
        recordId.slice(0, 8);
      nodes.push({ id: key, collection, label });
      if (remaining <= 0) return;
      const related = await engine.listRelated(
        ctx.workspaceId,
        ctx.principalId,
        collection,
        recordId,
      );
      for (const edge of related.outgoing) {
        const targetKey = `${edge.collection}:${edge.recordId}`;
        edges.push({ from: key, to: targetKey, field: edge.field });
        await addRecord(edge.collection, edge.recordId, remaining - 1);
      }
      for (const edge of related.incoming) {
        const sourceKey = `${edge.collection}:${edge.recordId}`;
        edges.push({ from: sourceKey, to: key, field: edge.field });
        await addRecord(edge.collection, edge.recordId, remaining - 1);
      }
    }

    if (focusCollection && focusRecordId) {
      await addRecord(focusCollection, focusRecordId, maxDepth);
    } else {
      for (const collection of collections.slice(0, 8)) {
        const rows = await engine.query(ctx.workspaceId, ctx.principalId, {
          collection: collection.name,
          limit: 20,
        });
        for (const row of rows) {
          if (typeof row.id !== 'string') continue;
          await addRecord(collection.name, row.id, 1);
        }
      }
    }

    // Wiki-link edges in addition to typed relations (already page-ACL scoped).
    const wikiEdges = await engine.listWikiLinkEdges(
      ctx.workspaceId,
      ctx.principalId,
    );
    const edgeKeys = new Set(edges.map((e) => `${e.from}->${e.to}:${e.field}`));
    for (const wiki of wikiEdges) {
      const fromKey = `${wiki.fromCollection}:${wiki.fromRecordId}`;
      const toKey = `${wiki.toCollection}:${wiki.toRecordId}`;
      const include =
        !focusCollection ||
        !focusRecordId ||
        seen.has(fromKey) ||
        seen.has(toKey);
      if (!include) continue;
      if (!seen.has(fromKey)) {
        await addRecord(wiki.fromCollection, wiki.fromRecordId, 0);
      }
      if (!seen.has(toKey)) {
        await addRecord(wiki.toCollection, wiki.toRecordId, 0);
      }
      if (!seen.has(fromKey) || !seen.has(toKey)) continue;
      const field = `wiki:${wiki.rawTarget}`;
      const dedupe = `${fromKey}->${toKey}:${field}`;
      if (edgeKeys.has(dedupe)) continue;
      edgeKeys.add(dedupe);
      edges.push({ from: fromKey, to: toKey, field });
    }

    return NextResponse.json({
      nodes,
      edges,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
