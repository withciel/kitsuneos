export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Capability = 'none' | 'read' | 'propose' | 'write' | 'admin';

export const CAPABILITY_ORDER: Capability[] = [
  'none',
  'read',
  'propose',
  'write',
  'admin',
];

export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'timestamp'
  | 'enum'
  | 'relation'
  | 'prose';

export type PrincipalKind = 'human' | 'agent' | 'service';

export type ChangeSetStatus =
  | 'open'
  | 'blocked'
  | 'applied'
  | 'rejected'
  | 'stale'
  | 'expired';

export type ChangeOpKind = 'insert' | 'update' | 'delete';

export type ChangeOpStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'conflicted';

export type Predicate =
  | { op: 'and' | 'or'; operands: Predicate[] }
  | { op: 'not'; operand: Predicate }
  | {
      field: string;
      op:
        | 'eq'
        | 'neq'
        | 'lt'
        | 'lte'
        | 'gt'
        | 'gte'
        | 'in'
        | 'is_null'
        | 'is_not_null';
      value?: JsonValue;
    };

export interface FieldDefinition {
  name: string;
  type: FieldType;
  nullable?: boolean;
  relationTarget?: string;
  enumValues?: string[];
  indexed?: boolean;
}

export interface CollectionDefinition {
  name: string;
  fields: FieldDefinition[];
}

export interface ResolvedGrant {
  capability: Capability;
  fieldMask: string[] | null;
  rowPredicate: Predicate | null;
}

export interface QueryFilter {
  field: string;
  op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in';
  value: JsonValue;
}

export interface QuerySort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface QueryAggregate {
  fn: 'count' | 'sum' | 'avg' | 'min' | 'max';
  field?: string;
  alias: string;
}

export interface QueryRequest {
  collection: string;
  fields?: string[];
  filters?: QueryFilter[];
  sort?: QuerySort[];
  aggregates?: QueryAggregate[];
  groupBy?: string[];
  limit?: number;
  offset?: number;
}

export interface ChangeOpInput {
  collection: string;
  recordId?: string;
  op: ChangeOpKind;
  fieldName?: string;
  newValue?: JsonValue;
}

export interface ProposeChangeSetInput {
  title?: string;
  rationale?: string;
  operations: ChangeOpInput[];
}

export interface ReviewDecision {
  opId: string;
  status: 'approved' | 'rejected';
  comment?: string;
}

export interface DbConfig {
  ownerUrl: string;
  appUrl: string;
}

export interface KitsuneContext {
  workspaceId: string;
  principalId: string;
  schemaName: string;
}

export class KitsuneError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_found'
      | 'forbidden'
      | 'validation'
      | 'conflict'
      | 'expired'
      | 'blocked'
      | 'internal' = 'validation',
    readonly details?: Record<string, JsonValue>,
  ) {
    super(message);
    this.name = 'KitsuneError';
  }
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof KitsuneError && error.code === 'not_found';
}

export function schemaNameForWorkspace(workspaceId: string): string {
  return `ws_${workspaceId.replace(/-/g, '')}`;
}

export function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new KitsuneError(`Invalid identifier: ${name}`, 'validation');
  }
  return `"${name}"`;
}

export function qualifiedTable(schemaName: string, tableName: string): string {
  return `${quoteIdent(schemaName)}.${quoteIdent(tableName)}`;
}

export function revTableName(tableName: string): string {
  return `${tableName}__rev`;
}

export const SYSTEM_COLUMNS = [
  'id',
  '_revision',
  '_updated_at',
  '_updated_by',
  '_deleted_at',
] as const;
