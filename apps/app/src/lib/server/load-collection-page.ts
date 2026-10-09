import type { JsonValue } from '@kitsuneos/core';
import type {
  FieldMeta,
  RelationOption,
} from '@/components/page/field-control';
import { engine } from '@/lib/engine';
import { recordLabel } from '@/lib/record-label';
import { requireWorkspace } from '@/lib/require-workspace';
import type { WorkspaceSchemaCollection } from '@/lib/workspace-session';

export async function loadRelationOptionsServer(
  workspaceId: string,
  principalId: string,
  collections: Array<{ name: string; fields: FieldMeta[] }>,
): Promise<Record<string, RelationOption[]>> {
  const targets = new Set<string>();
  for (const collection of collections) {
    for (const field of collection.fields) {
      if (field.type === 'relation' && field.relationTarget) {
        targets.add(field.relationTarget);
      }
    }
  }

  const options: Record<string, RelationOption[]> = {};
  await Promise.all(
    [...targets].map(async (target) => {
      const meta = collections.find((item) => item.name === target);
      const fields = meta?.fields.map((field) => field.name) ?? ['id'];
      try {
        const rows = await engine.query(workspaceId, principalId, {
          collection: target,
          fields,
          limit: 100,
        });
        options[target] = rows
          .filter((row): row is Record<string, JsonValue> & { id: string } => {
            return typeof row.id === 'string' && row.id.length > 0;
          })
          .map((row) => ({ id: row.id, label: recordLabel(row) }));
      } catch {
        options[target] = [];
      }
    }),
  );
  return options;
}

export type CollectionPageData = {
  collection: string;
  meta: WorkspaceSchemaCollection;
  fields: FieldMeta[];
  capability: string;
  rows: Array<Record<string, JsonValue>>;
  truncated: boolean;
  relationOptions: Record<string, RelationOption[]>;
  viewScope: string;
};

export async function loadCollectionPage(
  collection: string,
): Promise<CollectionPageData | null> {
  const ctx = await requireWorkspace();
  const schema = await engine.describeSchema(ctx.workspaceId, ctx.principalId);
  const meta = (schema.collections ?? []).find((c) => c.name === collection) as
    | WorkspaceSchemaCollection
    | undefined;
  if (!meta) return null;

  const fieldNames = meta.fields.map((f) => f.name);
  const rows = await engine.query(ctx.workspaceId, ctx.principalId, {
    collection,
    fields: fieldNames,
    limit: 100,
  });
  const relationOptions = await loadRelationOptionsServer(
    ctx.workspaceId,
    ctx.principalId,
    schema.collections ?? [],
  );

  return {
    collection,
    meta,
    fields: meta.fields,
    capability: meta.capability ?? '',
    rows,
    truncated: rows.length >= 100,
    relationOptions,
    viewScope: ctx.userId || ctx.workspaceId || 'anon',
  };
}
