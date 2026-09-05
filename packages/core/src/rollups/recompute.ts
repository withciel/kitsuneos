import type { PoolClient } from 'pg';
import { writeRevision } from '../revisions/write.js';
import {
  KitsuneError,
  quoteIdent,
  type RollupAggregate,
  type RollupDefinition,
} from '../types.js';

export type { RollupAggregate, RollupDefinition };

export interface RollupBinding {
  parentCollection: string;
  parentTable: string;
  parentField: string;
  sourceCollection: string;
  sourceTable: string;
  foreignKeyField: string;
  aggregate: RollupAggregate;
  valueField: string | null;
}

const AGG_SQL: Record<RollupAggregate, string> = {
  sum: 'COALESCE(SUM(%s), 0)',
  count: 'COUNT(*)',
  avg: 'COALESCE(AVG(%s), 0)',
  min: 'MIN(%s)',
  max: 'MAX(%s)',
};

export function assertRollupDefinition(rollup: RollupDefinition): void {
  if (!rollup.sourceCollection || !rollup.foreignKeyField) {
    throw new KitsuneError(
      'rollup requires sourceCollection and foreignKeyField',
      'validation',
    );
  }
  if (!(rollup.aggregate in AGG_SQL)) {
    throw new KitsuneError(
      `Invalid rollup aggregate: ${rollup.aggregate}`,
      'validation',
    );
  }
  if (rollup.aggregate !== 'count' && !rollup.valueField) {
    throw new KitsuneError(
      `rollup aggregate ${rollup.aggregate} requires valueField`,
      'validation',
    );
  }
}

export async function loadRollupBindingsForSource(
  client: PoolClient,
  workspaceId: string,
  sourceCollection: string,
): Promise<RollupBinding[]> {
  const result = await client.query<{
    parent_collection: string;
    parent_table: string;
    parent_field: string;
    source_collection: string;
    source_table: string;
    foreign_key_field: string;
    aggregate: RollupAggregate;
    value_field: string | null;
  }>(
    `SELECT
        parent.name AS parent_collection,
        parent.table_name AS parent_table,
        pf.name AS parent_field,
        source.name AS source_collection,
        source.table_name AS source_table,
        pf.rollup->>'foreignKeyField' AS foreign_key_field,
        pf.rollup->>'aggregate' AS aggregate,
        pf.rollup->>'valueField' AS value_field
       FROM kitsune.fields pf
       JOIN kitsune.collections parent ON parent.id = pf.collection_id
       JOIN kitsune.collections source
         ON source.workspace_id = parent.workspace_id
        AND source.name = pf.rollup->>'sourceCollection'
      WHERE parent.workspace_id = $1
        AND pf.rollup IS NOT NULL
        AND pf.rollup->>'sourceCollection' = $2`,
    [workspaceId, sourceCollection],
  );
  return result.rows.map((row) => ({
    parentCollection: row.parent_collection,
    parentTable: row.parent_table,
    parentField: row.parent_field,
    sourceCollection: row.source_collection,
    sourceTable: row.source_table,
    foreignKeyField: row.foreign_key_field,
    aggregate: row.aggregate,
    valueField: row.value_field,
  }));
}

export async function loadRollupFieldNames(
  client: PoolClient,
  workspaceId: string,
  collection: string,
): Promise<Set<string>> {
  const result = await client.query<{ name: string }>(
    `SELECT f.name
       FROM kitsune.fields f
       JOIN kitsune.collections c ON c.id = f.collection_id
      WHERE c.workspace_id = $1 AND c.name = $2 AND f.rollup IS NOT NULL`,
    [workspaceId, collection],
  );
  return new Set(result.rows.map((r) => r.name));
}

export async function readSourceForeignKeys(
  client: PoolClient,
  schemaName: string,
  sourceTable: string,
  recordId: string,
  foreignKeyFields: string[],
): Promise<Record<string, string | null>> {
  if (foreignKeyFields.length === 0) return {};
  const cols = foreignKeyFields.map((f) => quoteIdent(f)).join(', ');
  const table = `${quoteIdent(schemaName)}.${quoteIdent(sourceTable)}`;
  const result = await client.query<Record<string, string | null>>(
    `SELECT ${cols} FROM ${table} WHERE id = $1`,
    [recordId],
  );
  return result.rows[0] ?? {};
}

/**
 * Recompute stored rollup values for parent records.
 * Writes a revision when the value changes, attributed to `principalId`.
 */
export async function recomputeRollupParents(
  client: PoolClient,
  schemaName: string,
  principalId: string,
  changeSetId: string | null,
  bindings: RollupBinding[],
  parentIdsByCollection: Map<string, Set<string>>,
): Promise<void> {
  for (const binding of bindings) {
    const parentIds = parentIdsByCollection.get(binding.parentCollection);
    if (!parentIds || parentIds.size === 0) continue;

    for (const parentId of parentIds) {
      const aggTemplate = AGG_SQL[binding.aggregate];
      const aggExpr =
        binding.aggregate === 'count'
          ? aggTemplate
          : aggTemplate.replace('%s', quoteIdent(binding.valueField as string));
      const sourceTable = `${quoteIdent(schemaName)}.${quoteIdent(binding.sourceTable)}`;
      const parentTable = `${quoteIdent(schemaName)}.${quoteIdent(binding.parentTable)}`;

      const agg = await client.query<{ value: string | number | null }>(
        `SELECT ${aggExpr} AS value
           FROM ${sourceTable}
          WHERE ${quoteIdent(binding.foreignKeyField)} = $1
            AND _deleted_at IS NULL`,
        [parentId],
      );
      const raw = agg.rows[0]?.value;
      const nextValue =
        raw === null || raw === undefined
          ? binding.aggregate === 'count'
            ? 0
            : null
          : Number(raw);

      const current = await client.query<{
        value: string | number | null;
        _revision: string;
      }>(
        `SELECT ${quoteIdent(binding.parentField)} AS value, _revision
           FROM ${parentTable}
          WHERE id = $1 AND _deleted_at IS NULL`,
        [parentId],
      );
      const row = current.rows[0];
      if (!row) continue;

      const prev =
        row.value === null || row.value === undefined
          ? null
          : Number(row.value);
      if (prev === nextValue || (prev === null && nextValue === null)) {
        continue;
      }

      const nextRevision = Number(row._revision) + 1;
      await client.query(
        `UPDATE ${parentTable}
            SET ${quoteIdent(binding.parentField)} = $1,
                _revision = $2,
                _updated_at = now(),
                _updated_by = $3
          WHERE id = $4`,
        [nextValue, nextRevision, principalId, parentId],
      );

      const snapshot = await client.query<{ row: Record<string, unknown> }>(
        `SELECT to_jsonb(t) AS row FROM ${parentTable} t WHERE id = $1`,
        [parentId],
      );
      await writeRevision(
        client,
        schemaName,
        binding.parentTable,
        parentId,
        nextRevision,
        snapshot.rows[0]?.row ?? {},
        [binding.parentField],
        principalId,
        changeSetId,
      );
    }
  }
}

export function markParent(
  parentIdsByCollection: Map<string, Set<string>>,
  parentCollection: string,
  parentId: string | null | undefined,
): void {
  if (!parentId) return;
  let set = parentIdsByCollection.get(parentCollection);
  if (!set) {
    set = new Set();
    parentIdsByCollection.set(parentCollection, set);
  }
  set.add(parentId);
}
