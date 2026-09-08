import type { JsonValue } from '@kitsuneos/core';
import type {
  FieldMeta,
  RelationOption,
} from '@/components/page/field-control';
import { recordLabel } from '@/lib/record-label';

export interface RelationSchemaCollection {
  name: string;
  fields: FieldMeta[];
}

/** Load label options for every relation target referenced by the given schema. */
export async function loadRelationOptions(
  collections: RelationSchemaCollection[],
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
      const queryRes = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection: target,
          fields,
          limit: 100,
        }),
      });
      const queryBody = (await queryRes.json()) as {
        rows?: Array<Record<string, JsonValue>>;
        error?: string;
      };
      if (!queryRes.ok) {
        throw new Error(
          queryBody.error ?? `Failed to load related ${target} pages`,
        );
      }
      options[target] = (queryBody.rows ?? [])
        .filter((row): row is Record<string, JsonValue> & { id: string } => {
          return typeof row.id === 'string' && row.id.length > 0;
        })
        .map((row) => ({ id: row.id, label: recordLabel(row) }));
    }),
  );
  return options;
}
