import type { JsonValue, Predicate } from '../types.js';
import { KitsuneError } from '../types.js';

export interface CompiledPredicate {
  sql: string;
  params: JsonValue[];
}

export function compilePredicate(
  predicate: Predicate,
  tableAlias: string,
  startParamIndex = 1,
): CompiledPredicate {
  const params: JsonValue[] = [];
  let idx = startParamIndex;

  const compile = (node: Predicate): string => {
    if ('operands' in node && (node.op === 'and' || node.op === 'or')) {
      const parts = node.operands.map((operand) => compile(operand));
      if (parts.length === 0) {
        return node.op === 'and' ? 'TRUE' : 'FALSE';
      }
      return `(${parts.join(node.op === 'and' ? ' AND ' : ' OR ')})`;
    }
    if ('operand' in node && node.op === 'not') {
      return `(NOT ${compile(node.operand)})`;
    }
    if ('field' in node) {
      const col = `${tableAlias}.${quoteField(node.field)}`;
      switch (node.op) {
        case 'is_null':
          return `${col} IS NULL`;
        case 'is_not_null':
          return `${col} IS NOT NULL`;
        case 'eq':
        case 'neq':
        case 'lt':
        case 'lte':
        case 'gt':
        case 'gte': {
          const opMap = {
            eq: '=',
            neq: '<>',
            lt: '<',
            lte: '<=',
            gt: '>',
            gte: '>=',
          } as const;
          params.push(node.value ?? null);
          return `${col} ${opMap[node.op]} $${idx++}`;
        }
        case 'in': {
          const values = Array.isArray(node.value) ? node.value : [];
          if (values.length === 0) {
            return 'FALSE';
          }
          const placeholders: string[] = [];
          for (const value of values) {
            params.push(value);
            placeholders.push(`$${idx++}`);
          }
          return `${col} IN (${placeholders.join(', ')})`;
        }
        default:
          throw new KitsuneError(`Unsupported predicate op: ${(node as Predicate).op}`, 'validation');
      }
    }
    throw new KitsuneError('Invalid predicate node', 'validation');
  };

  return { sql: compile(predicate), params };
}

function quoteField(field: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(field)) {
    throw new KitsuneError(`Invalid field in predicate: ${field}`, 'validation');
  }
  return `"${field}"`;
}

export function compileFilter(
  field: string,
  op: string,
  value: JsonValue,
  tableAlias: string,
  paramIndex: number,
): { sql: string; params: JsonValue[] } {
  const predicate = {
    field,
    op,
    value,
  } as Predicate;
  const compiled = compilePredicate(predicate, tableAlias, paramIndex);
  return { sql: compiled.sql, params: compiled.params };
}
