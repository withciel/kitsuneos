import type { PoolClient } from 'pg';
import {
  assertFieldAllowed,
  loadResolvedGrant,
  projectFields,
} from '../grants/resolve.js';
import type { QueryAggregate, QueryRequest, ResolvedGrant } from '../types.js';
import { KitsuneError, quoteIdent } from '../types.js';
import { compileFilter, compilePredicate } from './predicate-sql.js';

export interface CollectionFieldMeta {
  name: string;
  type: string;
  relationTarget: string | null;
}

export interface CollectionMeta {
  id: string;
  name: string;
  tableName: string;
  fields: string[];
  fieldMeta: CollectionFieldMeta[];
}

export interface CompiledQuery {
  sql: string;
  params: unknown[];
  projectedFields: string[];
}

export async function getCollectionMeta(
  client: PoolClient,
  workspaceId: string,
  collectionName: string,
): Promise<CollectionMeta> {
  const collection = await client.query<{
    id: string;
    name: string;
    table_name: string;
  }>(
    `SELECT id, name, table_name FROM kitsune.collections
     WHERE workspace_id = $1 AND name = $2`,
    [workspaceId, collectionName],
  );
  const row = collection.rows[0];
  if (!row) {
    throw new KitsuneError('Not found', 'not_found');
  }
  const fields = await client.query<{
    name: string;
    type: string;
    relation_target: string | null;
  }>(
    `SELECT f.name, f.type, target.name AS relation_target
       FROM kitsune.fields f
       LEFT JOIN kitsune.collections target ON target.id = f.relation_target
      WHERE f.collection_id = $1
      ORDER BY f.name`,
    [row.id],
  );
  return {
    id: row.id,
    name: row.name,
    tableName: row.table_name,
    fields: fields.rows.map((f) => f.name),
    fieldMeta: fields.rows.map((f) => ({
      name: f.name,
      type: f.type,
      relationTarget: f.relation_target,
    })),
  };
}

const AGG_FN_SQL = {
  count: 'COUNT',
  sum: 'SUM',
  avg: 'AVG',
  min: 'MIN',
  max: 'MAX',
} as const;

type AllowedAggFn = keyof typeof AGG_FN_SQL;

function assertAggregateFn(fn: string): AllowedAggFn {
  if (!(fn in AGG_FN_SQL)) {
    throw new KitsuneError(`Invalid aggregate function: ${fn}`, 'validation');
  }
  return fn as AllowedAggFn;
}

function aggFnSql(fn: string): string {
  return AGG_FN_SQL[assertAggregateFn(fn)];
}

function assertSortDirection(direction: string): 'ASC' | 'DESC' {
  if (direction === 'asc') {
    return 'ASC';
  }
  if (direction === 'desc') {
    return 'DESC';
  }
  throw new KitsuneError(`Invalid sort direction: ${direction}`, 'validation');
}

function coerceNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new KitsuneError(`Invalid ${label}`, 'validation');
  }
  return value;
}

function validateAggregates(
  grant: ResolvedGrant | null,
  aggregates: QueryAggregate[] | undefined,
): void {
  if (!aggregates?.length) {
    return;
  }
  for (const agg of aggregates) {
    assertAggregateFn(agg.fn);
    if (agg.field) {
      assertFieldAllowed(grant, agg.field, 'read');
    }
  }
}

export async function compileQuery(
  client: PoolClient,
  workspaceId: string,
  principalId: string,
  schemaName: string,
  request: QueryRequest,
): Promise<CompiledQuery> {
  const meta = await getCollectionMeta(client, workspaceId, request.collection);
  const grant = await loadResolvedGrant(client, principalId, meta.id);
  if (!grant || grant.capability === 'none') {
    throw new KitsuneError('Not found', 'not_found');
  }

  validateAggregates(grant, request.aggregates);

  for (const filter of request.filters ?? []) {
    assertFieldAllowed(grant, filter.field, 'read');
  }
  for (const sort of request.sort ?? []) {
    assertFieldAllowed(grant, sort.field, 'read');
    assertSortDirection(sort.direction);
  }
  for (const group of request.groupBy ?? []) {
    assertFieldAllowed(grant, group, 'read');
  }

  const projected = projectFields(grant, request.fields, meta.fields);
  const alias = 't';
  const table = `${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)}`;
  const params: unknown[] = [];
  let paramIdx = 1;
  const whereParts: string[] = [];

  if (grant.rowPredicate) {
    const compiled = compilePredicate(grant.rowPredicate, alias, paramIdx);
    whereParts.push(compiled.sql);
    params.push(...compiled.params);
    paramIdx += compiled.params.length;
  }

  for (const filter of request.filters ?? []) {
    const compiled = compileFilter(
      filter.field,
      filter.op,
      filter.value,
      alias,
      paramIdx,
    );
    whereParts.push(compiled.sql);
    params.push(...compiled.params);
    paramIdx += compiled.params.length;
  }

  const whereClause = whereParts.length
    ? `WHERE ${whereParts.join(' AND ')}`
    : '';

  if (request.aggregates?.length) {
    const selectParts: string[] = [];
    for (const group of request.groupBy ?? []) {
      selectParts.push(`${alias}.${quoteIdent(group)} AS ${quoteIdent(group)}`);
    }
    for (const agg of request.aggregates) {
      if (agg.field) {
        selectParts.push(
          `${aggFnSql(agg.fn)}(${alias}.${quoteIdent(agg.field)}) AS ${quoteIdent(agg.alias)}`,
        );
      } else {
        selectParts.push(`${aggFnSql(agg.fn)}(*) AS ${quoteIdent(agg.alias)}`);
      }
    }
    const groupClause = request.groupBy?.length
      ? `GROUP BY ${request.groupBy.map((g) => `${alias}.${quoteIdent(g)}`).join(', ')}`
      : '';
    const sql =
      `SELECT ${selectParts.join(', ')} FROM ${table} ${alias} ${whereClause} ${groupClause}`.trim();
    return { sql, params, projectedFields: projected };
  }

  // id is the record's address, not one of its fields. Without it a masked principal
  // gets rows it cannot address, so it could never propose a change against one.
  // Row-level authorization still decides which rows are visible at all.
  const projectedWithId = ['id', ...projected.filter((f) => f !== 'id')];
  const selectCols = projectedWithId.map((f) => `${alias}.${quoteIdent(f)}`);
  const orderClause = request.sort?.length
    ? `ORDER BY ${request.sort
        .map(
          (s) =>
            `${alias}.${quoteIdent(s.field)} ${assertSortDirection(s.direction)}`,
        )
        .join(', ')}`
    : '';
  const limitClause =
    request.limit !== undefined
      ? `LIMIT ${coerceNonNegativeInteger(request.limit, 'limit')}`
      : '';
  const offsetClause =
    request.offset !== undefined
      ? `OFFSET ${coerceNonNegativeInteger(request.offset, 'offset')}`
      : '';
  const sql =
    `SELECT ${selectCols.join(', ')} FROM ${table} ${alias} ${whereClause} ${orderClause} ${limitClause} ${offsetClause}`.trim();

  return { sql, params, projectedFields: projectedWithId };
}

export async function compileReadRecord(
  client: PoolClient,
  workspaceId: string,
  principalId: string,
  schemaName: string,
  collectionName: string,
  recordId: string,
  fields?: string[],
): Promise<CompiledQuery> {
  return compileQuery(client, workspaceId, principalId, schemaName, {
    collection: collectionName,
    fields,
    filters: [{ field: 'id', op: 'eq', value: recordId }],
    limit: 1,
  });
}
