import type { JsonValue, KitsuneEngine } from '@kitsuneos/core';
import DataLoader from 'dataloader';

export interface GraphqlAuthContext {
  workspaceId: string;
  principalId: string;
}

export interface RecordLoader {
  load(id: string): Promise<Record<string, JsonValue> | null>;
}

export interface RelationLoaders {
  forCollection(collection: string): RecordLoader;
}

export function createLoaders(
  engine: KitsuneEngine,
  ctx: GraphqlAuthContext,
): RelationLoaders {
  const loaders = new Map<
    string,
    DataLoader<string, Record<string, JsonValue> | null>
  >();

  return {
    forCollection(collection: string): RecordLoader {
      let loader = loaders.get(collection);
      if (!loader) {
        loader = new DataLoader<string, Record<string, JsonValue> | null>(
          async (ids) => {
            const unique = [...new Set(ids)];
            const rows = await engine.query(ctx.workspaceId, ctx.principalId, {
              collection,
              filters: [{ field: 'id', op: 'in', value: unique }],
            });
            const byId = new Map(
              rows.map((row) => [String(row.id), row] as const),
            );
            return ids.map((id) => byId.get(id) ?? null);
          },
        );
        loaders.set(collection, loader);
      }
      return loader;
    },
  };
}
