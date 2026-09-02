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
    limit?: number;
  };
  expectError?: 'forbidden' | 'not_found';
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

export function oracleQuery(
  principal: OraclePrincipal,
  records: OracleRecord[],
  shape: OracleQueryShape,
): Record<string, JsonValue>[] | 'forbidden' | 'not_found' {
  const grant = principal.grants[shape.collection];
  if (!grant || grant.capability === 'none') {
    return 'not_found';
  }

  const allFields = records.find((r) => r.collection === shape.collection)
    ? Object.keys(
        records.find((r) => r.collection === shape.collection)?.fields,
      )
    : [];

  const requestedFields = shape.request.fields ?? grant.fieldMask ?? allFields;
  for (const field of requestedFields) {
    if (grant.fieldMask !== null && !grant.fieldMask.includes(field)) {
      return 'forbidden';
    }
  }
  for (const filter of shape.request.filters ?? []) {
    if (grant.fieldMask !== null && !grant.fieldMask.includes(filter.field)) {
      return 'forbidden';
    }
  }
  for (const sort of shape.request.sort ?? []) {
    if (grant.fieldMask !== null && !grant.fieldMask.includes(sort.field)) {
      return 'forbidden';
    }
  }
  for (const agg of shape.request.aggregates ?? []) {
    if (
      agg.field &&
      grant.fieldMask !== null &&
      !grant.fieldMask.includes(agg.field)
    ) {
      return 'forbidden';
    }
  }

  let filtered = records.filter(
    (r) => r.collection === shape.collection && !r.deleted,
  );
  if (grant.rowPredicate) {
    filtered = filtered.filter((r) => evalPredicate(grant.rowPredicate!, r));
  }
  for (const filter of shape.request.filters ?? []) {
    filtered = filtered.filter((r) => matchesFilter(r, filter));
  }

  if (shape.request.aggregates?.length) {
    const groups = new Map<string, OracleRecord[]>();
    for (const record of filtered) {
      const key = (shape.request.groupBy ?? [])
        .map((g) => String(record.fields[g]))
        .join('|');
      const list = groups.get(key) ?? [];
      list.push(record);
      groups.set(key, list);
    }
    const results: Record<string, JsonValue>[] = [];
    for (const [, group] of groups) {
      const row: Record<string, JsonValue> = {};
      for (const g of shape.request.groupBy ?? []) {
        row[g] = group[0]?.fields[g] ?? null;
      }
      for (const agg of shape.request.aggregates) {
        if (agg.fn === 'count') {
          row[agg.alias] = group.length;
        } else if (agg.field) {
          const nums = group.map((r) => Number(r.fields[agg.field!]));
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

  const projected = filtered.map((r) => {
    const row: Record<string, JsonValue> = { id: r.id };
    for (const field of requestedFields) {
      row[field] = r.fields[field] ?? null;
    }
    return row;
  });

  if (shape.request.sort?.length) {
    projected.sort((a, b) => {
      for (const s of shape.request.sort!) {
        const av = a[s.field];
        const bv = b[s.field];
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
