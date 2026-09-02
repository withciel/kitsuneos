import type { PoolClient } from 'pg';
import {
  assertFieldAllowed,
  loadResolvedGrant,
  projectFields,
} from '../grants/resolve.js';
import { assertIdentifier } from '../schema/validate-definition.js';
import type { QueryRequest, ResolvedGrant } from '../types.js';
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

const ROOT_ALIAS = 't';

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

export function splitQualifiedName(
  raw: string,
  joinAlias: string | null,
): { alias: string; field: string } {
  const dot = raw.indexOf('.');
  if (dot === -1) {
    return { alias: ROOT_ALIAS, field: raw };
  }
  const as = raw.slice(0, dot);
  const field = raw.slice(dot + 1);
  if (!joinAlias || as !== joinAlias) {
    throw new KitsuneError(`Unknown field qualifier: ${as}`, 'validation');
  }
  if (!field || field.includes('.')) {
    throw new KitsuneError(`Invalid field: ${raw}`, 'validation');
  }
  return { alias: as, field };
}

function outputAlias(raw: string): string {
  return raw.replaceAll('.', '_');
}

function assertReadableField(grant: ResolvedGrant | null, field: string): void {
  if (field === 'id') {
    if (!grant || grant.capability === 'none') {
      throw new KitsuneError('Not found', 'not_found');
    }
    return;
  }
  assertFieldAllowed(grant, field, 'read');
}

function validateFieldRef(
  raw: string,
  joinAlias: string | null,
  rootGrant: ResolvedGrant | null,
  joinGrant: ResolvedGrant | null,
): { alias: string; field: string } {
  const parsed = splitQualifiedName(raw, joinAlias);
  const grant = parsed.alias === ROOT_ALIAS ? rootGrant : joinGrant;
  assertReadableField(grant, parsed.field);
  return parsed;
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

  let joinMeta: CollectionMeta | null = null;
  let joinGrant: ResolvedGrant | null = null;
  let joinAlias: string | null = null;
  let joinFk = '';
  let joinClause = '';

  if (request.join) {
    assertIdentifier(request.join.as, 'join alias');
    if (request.join.as === ROOT_ALIAS) {
      throw new KitsuneError('Join alias cannot be t', 'validation');
    }
    const relation = meta.fieldMeta.find((f) => f.name === request.join?.field);
    if (!relation || relation.type !== 'relation' || !relation.relationTarget) {
      throw new KitsuneError(
        `Join field is not a relation: ${request.join.field}`,
        'validation',
      );
    }
    joinMeta = await getCollectionMeta(
      client,
      workspaceId,
      relation.relationTarget,
    );
    joinGrant = await loadResolvedGrant(client, principalId, joinMeta.id);
    if (!joinGrant || joinGrant.capability === 'none') {
      throw new KitsuneError('Not found', 'not_found');
    }
    joinAlias = request.join.as;
    joinFk = request.join.field;
    const joinTable = `${quoteIdent(schemaName)}.${quoteIdent(joinMeta.tableName)}`;
    const qJoin = quoteIdent(joinAlias);
    joinClause = `INNER JOIN ${joinTable} ${qJoin} ON ${qJoin}.${quoteIdent('id')} = ${ROOT_ALIAS}.${quoteIdent(joinFk)} AND ${qJoin}.${quoteIdent('_deleted_at')} IS NULL`;
  }

  for (const agg of request.aggregates ?? []) {
    assertAggregateFn(agg.fn);
    if (agg.field) {
      validateFieldRef(agg.field, joinAlias, grant, joinGrant);
    }
  }
  for (const filter of request.filters ?? []) {
    validateFieldRef(filter.field, joinAlias, grant, joinGrant);
  }
  for (const sort of request.sort ?? []) {
    validateFieldRef(sort.field, joinAlias, grant, joinGrant);
    assertSortDirection(sort.direction);
  }
  for (const group of request.groupBy ?? []) {
    validateFieldRef(group, joinAlias, grant, joinGrant);
  }

  const rootRequested = (request.fields ?? []).filter(
    (f) => splitQualifiedName(f, joinAlias).alias === ROOT_ALIAS,
  );
  const joinRequested = (request.fields ?? []).filter(
    (f) => splitQualifiedName(f, joinAlias).alias !== ROOT_ALIAS,
  );
  const projected = projectFields(
    grant,
    request.fields === undefined ? undefined : rootRequested,
    meta.fields,
  );
  if (joinRequested.length && joinMeta) {
    projectFields(
      joinGrant,
      joinRequested.map((f) => splitQualifiedName(f, joinAlias).field),
      joinMeta.fields,
    );
  }

  const table = `${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)}`;
  const params: unknown[] = [];
  let paramIdx = 1;
  const whereParts: string[] = [];

  if (grant.rowPredicate) {
    const compiled = compilePredicate(grant.rowPredicate, ROOT_ALIAS, paramIdx);
    whereParts.push(compiled.sql);
    params.push(...compiled.params);
    paramIdx += compiled.params.length;
  }
  if (joinGrant?.rowPredicate && joinAlias) {
    const compiled = compilePredicate(
      joinGrant.rowPredicate,
      joinAlias,
      paramIdx,
    );
    whereParts.push(compiled.sql);
    params.push(...compiled.params);
    paramIdx += compiled.params.length;
  }

  for (const filter of request.filters ?? []) {
    const parsed = splitQualifiedName(filter.field, joinAlias);
    const compiled = compileFilter(
      parsed.field,
      filter.op,
      filter.value,
      parsed.alias,
      paramIdx,
    );
    whereParts.push(compiled.sql);
    params.push(...compiled.params);
    paramIdx += compiled.params.length;
  }

  const whereClause = whereParts.length
    ? `WHERE ${whereParts.join(' AND ')}`
    : '';
  const fromClause = joinClause
    ? `${table} ${ROOT_ALIAS} ${joinClause}`
    : `${table} ${ROOT_ALIAS}`;

  if (request.aggregates?.length) {
    const selectParts: string[] = [];
    for (const group of request.groupBy ?? []) {
      const parsed = splitQualifiedName(group, joinAlias);
      selectParts.push(
        `${quoteIdent(parsed.alias)}.${quoteIdent(parsed.field)} AS ${quoteIdent(outputAlias(group))}`,
      );
    }
    for (const agg of request.aggregates) {
      if (agg.field) {
        const parsed = splitQualifiedName(agg.field, joinAlias);
        selectParts.push(
          `${aggFnSql(agg.fn)}(${quoteIdent(parsed.alias)}.${quoteIdent(parsed.field)}) AS ${quoteIdent(agg.alias)}`,
        );
      } else {
        selectParts.push(`${aggFnSql(agg.fn)}(*) AS ${quoteIdent(agg.alias)}`);
      }
    }
    const groupClause = request.groupBy?.length
      ? `GROUP BY ${request.groupBy
          .map((g) => {
            const parsed = splitQualifiedName(g, joinAlias);
            return `${quoteIdent(parsed.alias)}.${quoteIdent(parsed.field)}`;
          })
          .join(', ')}`
      : '';
    const sql =
      `SELECT ${selectParts.join(', ')} FROM ${fromClause} ${whereClause} ${groupClause}`.trim();
    return { sql, params, projectedFields: projected };
  }

  const projectedWithId = ['id', ...projected.filter((f) => f !== 'id')];
  const selectCols = projectedWithId.map(
    (f) => `${ROOT_ALIAS}.${quoteIdent(f)}`,
  );
  if (joinAlias && joinRequested.length) {
    for (const raw of joinRequested) {
      const parsed = splitQualifiedName(raw, joinAlias);
      selectCols.push(
        `${quoteIdent(parsed.alias)}.${quoteIdent(parsed.field)} AS ${quoteIdent(outputAlias(raw))}`,
      );
    }
  }
  const orderClause = request.sort?.length
    ? `ORDER BY ${request.sort
        .map((s) => {
          const parsed = splitQualifiedName(s.field, joinAlias);
          return `${quoteIdent(parsed.alias)}.${quoteIdent(parsed.field)} ${assertSortDirection(s.direction)}`;
        })
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
    `SELECT ${selectCols.join(', ')} FROM ${fromClause} ${whereClause} ${orderClause} ${limitClause} ${offsetClause}`.trim();

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
