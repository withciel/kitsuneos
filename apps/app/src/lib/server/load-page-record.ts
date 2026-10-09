import type { JsonValue } from '@kitsuneos/core';
import { handleRestRecordGet } from '@kitsuneos/graphql';
import type {
  FieldMeta,
  RelationOption,
} from '@/components/page/field-control';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';
import { loadRelationOptionsServer } from '@/lib/server/load-collection-page';
import type { WorkspaceSchemaCollection } from '@/lib/workspace-session';

function cellText(value: JsonValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export type PageRecordData = {
  pageId: string;
  collection: string;
  fields: FieldMeta[];
  capability: string;
  row: Record<string, JsonValue>;
  draft: Record<string, string>;
  relationOptions: Record<string, RelationOption[]>;
};

export async function loadPageRecord(
  collection: string,
  pageId: string,
): Promise<PageRecordData | null> {
  const ctx = await requireWorkspace();
  const schema = await engine.describeSchema(ctx.workspaceId, ctx.principalId);
  const meta = (schema.collections ?? []).find((c) => c.name === collection) as
    | WorkspaceSchemaCollection
    | undefined;
  if (!meta) return null;

  const result = await handleRestRecordGet(
    engine,
    {
      workspaceId: ctx.workspaceId,
      principalId: ctx.principalId,
    },
    collection,
    pageId,
  );
  if (
    result.status === 404 ||
    !result.body ||
    typeof result.body !== 'object'
  ) {
    return null;
  }

  const row = result.body as Record<string, JsonValue>;
  const draft: Record<string, string> = {};
  for (const field of meta.fields) {
    draft[field.name] = cellText(row[field.name]);
  }

  const relationOptions = await loadRelationOptionsServer(
    ctx.workspaceId,
    ctx.principalId,
    schema.collections ?? [],
  );

  return {
    pageId,
    collection,
    fields: meta.fields,
    capability: meta.capability ?? '',
    row,
    draft,
    relationOptions,
  };
}
