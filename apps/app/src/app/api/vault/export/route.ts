import { KitsuneError } from '@kitsuneos/core';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { jsonError } from '@/lib/http-error';
import { requireWorkspace } from '@/lib/require-workspace';
import { serializeVaultMarkdown, vaultFileName } from '@/lib/vault-md';
import { buildZip } from '@/lib/vault-zip';

/**
 * Export a collection as a zip of markdown files, one per record.
 *
 * `engine.query` compiles page-ACL predicates directly into the SQL WHERE
 * clause (see `compilePageAccessPredicate` in
 * `packages/core/src/compiler/query.ts`), so private/excluded pages are
 * silently omitted from the result set — never a 403. Only a missing or
 * ungranted collection surfaces as `not_found`.
 */
export async function GET(request: Request) {
  try {
    const ctx = await requireWorkspace();
    const url = new URL(request.url);
    const collection = url.searchParams.get('collection')?.trim() || 'notes';

    const schema = await engine.describeSchema(
      ctx.workspaceId,
      ctx.principalId,
    );
    const meta = schema.collections.find((c) => c.name === collection);
    if (!meta) {
      throw new KitsuneError('Not found', 'not_found');
    }

    const titleField =
      meta.fields.find((f) => f.name === 'title')?.name ??
      meta.fields.find((f) => f.type === 'text')?.name;
    const bodyField = meta.fields.find((f) => f.type === 'prose')?.name;

    const rows = await engine.query(ctx.workspaceId, ctx.principalId, {
      collection,
    });

    const usedNames = new Set<string>();
    const entries = rows.map((row) => {
      const id = String(row.id);
      const title = titleField ? String(row[titleField] ?? '') : id;
      const body = bodyField ? String(row[bodyField] ?? '') : '';
      let name = vaultFileName(title, id);
      while (usedNames.has(name)) {
        name = `${id}-${name}`;
      }
      usedNames.add(name);
      return {
        name,
        data: Buffer.from(serializeVaultMarkdown({ id, title, body }), 'utf8'),
      };
    });

    const zip = buildZip(entries);
    return new NextResponse(new Uint8Array(zip), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${collection}-vault.zip"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
