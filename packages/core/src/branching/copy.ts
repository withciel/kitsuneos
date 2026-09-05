import type { PoolClient } from 'pg';
import { quoteIdent } from '../types.js';

export interface BranchCollectionMeta {
  id: string;
  name: string;
  tableName: string;
}

export interface BranchFieldMeta {
  name: string;
  type: string;
  nullable: boolean;
  relationTargetName: string | null;
  enumValues: string[] | null;
  indexed: boolean;
  rollup: unknown | null;
}

/** Kahn topological order so relation targets are defined before dependents. */
export function orderCollectionsForBranch(
  collections: BranchCollectionMeta[],
  fieldsByCollectionId: Map<string, BranchFieldMeta[]>,
): BranchCollectionMeta[] {
  const byName = new Map(collections.map((c) => [c.name, c]));
  const indegree = new Map(collections.map((c) => [c.name, 0]));
  const edges = new Map<string, string[]>(collections.map((c) => [c.name, []]));

  for (const collection of collections) {
    const fields = fieldsByCollectionId.get(collection.id) ?? [];
    for (const field of fields) {
      if (field.type !== 'relation' || !field.relationTargetName) continue;
      if (!byName.has(field.relationTargetName)) continue;
      // edge: target -> dependent
      edges.get(field.relationTargetName)?.push(collection.name);
      indegree.set(collection.name, (indegree.get(collection.name) ?? 0) + 1);
    }
  }

  const queue = [...indegree.entries()]
    .filter(([, d]) => d === 0)
    .map(([name]) => name)
    .sort();
  const ordered: BranchCollectionMeta[] = [];
  while (queue.length > 0) {
    const name = queue.shift()!;
    const collection = byName.get(name);
    if (collection) ordered.push(collection);
    for (const next of edges.get(name) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
    queue.sort();
  }

  if (ordered.length !== collections.length) {
    // Cycle or missing target — fall back to original order.
    return collections;
  }
  return ordered;
}

export async function copyRelationTable(
  client: PoolClient,
  sourceSchema: string,
  targetSchema: string,
  tableName: string,
): Promise<void> {
  const columns = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position`,
    [targetSchema, tableName],
  );
  if (columns.rows.length === 0) {
    return;
  }
  const cols = columns.rows.map((r) => quoteIdent(r.column_name)).join(', ');
  await client.query(
    `INSERT INTO ${quoteIdent(targetSchema)}.${quoteIdent(tableName)} (${cols})
     SELECT ${cols}
       FROM ${quoteIdent(sourceSchema)}.${quoteIdent(tableName)}`,
  );
}

export function sanitizeBranchName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (!cleaned) {
    throw new Error('Branch name must contain letters or digits');
  }
  return cleaned;
}
