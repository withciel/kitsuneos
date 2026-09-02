import type { JsonValue, Predicate } from '@kitsuneos/core';

export interface OracleGrant {
  capability: 'none' | 'read' | 'propose' | 'write' | 'admin';
  fieldMask: string[] | null;
  rowPredicate: Predicate | null;
}

export interface OracleRecord {
  id: string;
  collection: string;
  fields: Record<string, JsonValue>;
  deleted?: boolean;
}

export interface OraclePrincipal {
  id: string;
  grants: Record<string, OracleGrant>;
}

export interface OracleQueryShape {
  name: string;
  collection: string;
  request: {
    fields?: string[];
    filters?: Array<{ field: string; op: string; value: JsonValue }>;
    sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
    aggregates?: Array<{ fn: string; field?: string; alias: string }>;
    groupBy?: string[];
    join?: { field: string; as: string };
    limit?: number;
  };
  expectError?: 'forbidden' | 'not_found' | 'validation';
}

function evalPredicate(predicate: Predicate, record: OracleRecord): boolean {
  if (
    'operands' in predicate &&
    (predicate.op === 'and' || predicate.op === 'or')
  ) {
    const results = predicate.operands.map((o) => evalPredicate(o, record));
    return predicate.op === 'and'
      ? results.every(Boolean)
      : results.some(Boolean);
  }
  if ('operand' in predicate && predicate.op === 'not') {
    return !evalPredicate(predicate.operand, record);
  }
  if ('field' in predicate) {
    const value = record.fields[predicate.field];
    switch (predicate.op) {
      case 'eq':
        return value === predicate.value;
      case 'neq':
        return value !== predicate.value;
      case 'lt':
        return Number(value) < Number(predicate.value);
      case 'lte':
        return Number(value) <= Number(predicate.value);
      case 'gt':
        return Number(value) > Number(predicate.value);
      case 'gte':
        return Number(value) >= Number(predicate.value);
      case 'in':
        return (
          Array.isArray(predicate.value) &&
          predicate.value.includes(value as JsonValue)
        );
      case 'is_null':
        return value === null || value === undefined;
      case 'is_not_null':
        return value !== null && value !== undefined;
      default:
        return false;
    }
  }
  return false;
}

function matchesFilter(
  record: OracleRecord,
  filter: { field: string; op: string; value: JsonValue },
): boolean {
  return evalPredicate(
    { field: filter.field, op: filter.op as 'eq', value: filter.value },
    record,
  );
}

function splitName(raw: string): { alias: string | null; field: string } {
  const dot = raw.indexOf('.');
  if (dot === -1) {
    return { alias: null, field: raw };
  }
  return { alias: raw.slice(0, dot), field: raw.slice(dot + 1) };
}

function maskAllows(grant: OracleGrant | undefined, field: string): boolean {
  if (!grant || grant.capability === 'none') {
    return false;
  }
  if (field === 'id') {
    return true;
  }
  return grant.fieldMask === null || grant.fieldMask.includes(field);
}

function joinTargetCollection(field: string): string {
  if (field.endsWith('_id')) {
    return `${field.slice(0, -3)}s`;
  }
  return field;
}

export function oracleQuery(
  principal: OraclePrincipal,
  records: OracleRecord[],
  shape: OracleQueryShape,
): Record<string, JsonValue>[] | 'forbidden' | 'not_found' | 'validation' {
  const grant = principal.grants[shape.collection];
  if (!grant || grant.capability === 'none') {
    return 'not_found';
  }

  const join = shape.request.join;
  let joinGrant: OracleGrant | undefined;
  let joinCollection: string | undefined;
  if (join) {
    const sample = records.find(
      (r) => r.collection === shape.collection && join.field in r.fields,
    );
    if (!sample && join.field !== 'account_id') {
      return 'validation';
    }
    joinCollection = joinTargetCollection(join.field);
    joinGrant = principal.grants[joinCollection];
    if (!joinGrant || joinGrant.capability === 'none') {
      return 'not_found';
    }
  }

  const checkField = (
    raw: string,
  ): 'forbidden' | 'not_found' | 'validation' | 'ok' => {
    const parsed = splitName(raw);
    if (parsed.alias) {
      if (!join || parsed.alias !== join.as) {
        return 'validation';
      }
      return maskAllows(joinGrant, parsed.field) ? 'ok' : 'forbidden';
    }
    return maskAllows(grant, parsed.field) ? 'ok' : 'forbidden';
  };

  for (const field of shape.request.fields ?? []) {
    const result = checkField(field);
    if (result !== 'ok') return result;
  }
  for (const filter of shape.request.filters ?? []) {
    const result = checkField(filter.field);
    if (result !== 'ok') return result;
  }
  for (const sort of shape.request.sort ?? []) {
    const result = checkField(sort.field);
    if (result !== 'ok') return result;
  }
  for (const group of shape.request.groupBy ?? []) {
    const result = checkField(group);
    if (result !== 'ok') return result;
  }
  for (const agg of shape.request.aggregates ?? []) {
    if (agg.field) {
      const result = checkField(agg.field);
      if (result !== 'ok') return result;
    }
  }

  let filtered = records.filter(
    (r) => r.collection === shape.collection && !r.deleted,
  );
  if (grant.rowPredicate) {
    filtered = filtered.filter((r) => evalPredicate(grant.rowPredicate!, r));
  }

  type Joined = { root: OracleRecord; parent: OracleRecord | null };
  let joined: Joined[] = filtered.map((root) => ({ root, parent: null }));
  if (join && joinCollection) {
    const parents = records.filter(
      (r) => r.collection === joinCollection && !r.deleted,
    );
    joined = [];
    for (const root of filtered) {
      const fk = String(root.fields[join.field] ?? '');
      const parent = parents.find((p) => p.id === fk) ?? null;
      if (!parent) {
        continue;
      }
      if (
        joinGrant?.rowPredicate &&
        !evalPredicate(joinGrant.rowPredicate, parent)
      ) {
        continue;
      }
      joined.push({ root, parent });
    }
  }

  const fieldValue = (row: Joined, raw: string): JsonValue => {
    const parsed = splitName(raw);
    if (parsed.alias && row.parent) {
      if (parsed.field === 'id') return row.parent.id;
      return row.parent.fields[parsed.field] ?? null;
    }
    if (parsed.field === 'id') {
      return row.root.id;
    }
    return row.root.fields[parsed.field] ?? null;
  };

  for (const filter of shape.request.filters ?? []) {
    joined = joined.filter((row) => {
      const field = splitName(filter.field).field;
      const value = fieldValue(row, filter.field);
      return matchesFilter(
        {
          id: row.root.id,
          collection: row.root.collection,
          fields: { [field]: value },
        },
        { field, op: filter.op, value: filter.value },
      );
    });
  }

  if (shape.request.aggregates?.length) {
    const groups = new Map<string, Joined[]>();
    for (const row of joined) {
      const key = (shape.request.groupBy ?? [])
        .map((g) => String(fieldValue(row, g)))
        .join('|');
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    const results: Record<string, JsonValue>[] = [];
    for (const [, group] of groups) {
      const first = group[0];
      if (!first) continue;
      const row: Record<string, JsonValue> = {};
      for (const g of shape.request.groupBy ?? []) {
        row[g.replaceAll('.', '_')] = fieldValue(first, g);
      }
      for (const agg of shape.request.aggregates) {
        if (agg.fn === 'count') {
          row[agg.alias] = group.length;
        } else if (agg.field) {
          const nums = group.map((r) => Number(fieldValue(r, agg.field!)));
          switch (agg.fn) {
            case 'sum':
              row[agg.alias] = nums.reduce((a, b) => a + b, 0);
              break;
            case 'avg':
              row[agg.alias] = nums.reduce((a, b) => a + b, 0) / nums.length;
              break;
            case 'min':
              row[agg.alias] = Math.min(...nums);
              break;
            case 'max':
              row[agg.alias] = Math.max(...nums);
              break;
          }
        }
      }
      results.push(row);
    }
    return results;
  }

  const allFields = records.find((r) => r.collection === shape.collection)
    ? Object.keys(
        records.find((r) => r.collection === shape.collection)?.fields ?? {},
      )
    : [];
  const requestedFields = shape.request.fields ?? grant.fieldMask ?? allFields;

  const projected = joined.map((j) => {
    const row: Record<string, JsonValue> = { id: j.root.id };
    for (const field of requestedFields) {
      const parsed = splitName(field);
      if (parsed.alias) {
        row[field.replaceAll('.', '_')] = fieldValue(j, field);
      } else {
        row[field] = j.root.fields[field] ?? null;
      }
    }
    return row;
  });

  if (shape.request.sort?.length) {
    projected.sort((a, b) => {
      for (const s of shape.request.sort!) {
        const key = s.field.replaceAll('.', '_');
        const av = a[key] ?? a[s.field];
        const bv = b[key] ?? b[s.field];
        if (av === bv) continue;
        const cmp = String(av).localeCompare(String(bv));
        return s.direction === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  const limited = shape.request.limit
    ? projected.slice(0, shape.request.limit)
    : projected;
  return limited;
}

export const QUERY_SHAPES: OracleQueryShape[] = [
  {
    name: 'list_all',
    collection: 'opportunities',
    request: { fields: ['name', 'stage'] },
  },
  {
    name: 'filter_stage',
    collection: 'opportunities',
    request: {
      fields: ['name', 'stage'],
      filters: [{ field: 'stage', op: 'eq', value: 'prospecting' }],
    },
  },
  {
    name: 'sort_amount',
    collection: 'opportunities',
    request: {
      fields: ['name', 'stage'],
      sort: [{ field: 'name', direction: 'asc' }],
    },
  },
  {
    name: 'read_single',
    collection: 'opportunities',
    request: {
      fields: ['name'],
      filters: [{ field: 'name', op: 'eq', value: 'Opp A' }],
    },
  },
  {
    name: 'aggregate_sum',
    collection: 'opportunities',
    request: {
      aggregates: [{ fn: 'sum', field: 'amount', alias: 'total' }],
      groupBy: ['stage'],
    },
  },
  {
    name: 'aggregate_count',
    collection: 'opportunities',
    request: {
      aggregates: [{ fn: 'count', alias: 'cnt' }],
      groupBy: ['stage'],
    },
  },
  {
    name: 'masked_field_read',
    collection: 'opportunities',
    request: { fields: ['amount'] },
    expectError: 'forbidden',
  },
  {
    name: 'filter_masked',
    collection: 'opportunities',
    request: {
      fields: ['name'],
      filters: [{ field: 'amount', op: 'gt', value: 100 }],
    },
    expectError: 'forbidden',
  },
  {
    name: 'sort_masked',
    collection: 'opportunities',
    request: {
      fields: ['name'],
      sort: [{ field: 'amount', direction: 'asc' }],
    },
    expectError: 'forbidden',
  },
  {
    name: 'aggregate_masked',
    collection: 'opportunities',
    request: { aggregates: [{ fn: 'sum', field: 'amount', alias: 'total' }] },
    expectError: 'forbidden',
  },
  {
    name: 'aggregate_sum_join',
    collection: 'opportunities',
    request: {
      join: { field: 'account_id', as: 'account' },
      aggregates: [{ fn: 'sum', field: 'amount', alias: 'total' }],
      groupBy: ['account.name'],
    },
  },
];

export const PRINCIPAL_CLASSES = [
  'admin',
  'reader',
  'agent',
  'predicateAgent',
  'limitedAgent',
  'noGrant',
  'service',
] as const;
