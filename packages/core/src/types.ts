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

export type RollupAggregate = 'sum' | 'count' | 'avg' | 'min' | 'max';

export interface RollupDefinition {
  sourceCollection: string;
  foreignKeyField: string;
  aggregate: RollupAggregate;
  valueField?: string;
}

export interface FieldDefinition {
  name: string;
  type: FieldType;
  nullable?: boolean;
  relationTarget?: string;
  enumValues?: string[];
  indexed?: boolean;
  /** When set, the field is platform-maintained and not writable. */
  rollup?: RollupDefinition;
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

export interface QueryJoin {
  field: string;
  as: string;
}

export interface QueryRequest {
  collection: string;
  fields?: string[];
  filters?: QueryFilter[];
  sort?: QuerySort[];
  aggregates?: QueryAggregate[];
  groupBy?: string[];
  join?: QueryJoin;
  limit?: number;
  offset?: number;
}

export type SchemaChangeOp = 'addField' | 'dropField' | 'setIndexed';

export interface SchemaChangeInput {
  collection: string;
  op: SchemaChangeOp;
  field?: FieldDefinition;
  fieldName?: string;
  indexed?: boolean;
  defaultValue?: JsonValue;
}

export interface RevisionSummary {
  collection: string;
  recordId: string;
  revision: number;
  changedFields: string[];
  principalId: string;
  changeSetId: string | null;
  validFrom: string;
}

export interface AuditQuery {
  actorId?: string;
  collectionId?: string;
  from?: string;
  to?: string;
  action?: string;
  outcome?: 'allowed' | 'denied';
  limit?: number;
}

export interface AuditRow {
  id: string;
  principalId: string;
  action: string;
  collectionId: string | null;
  recordIds: string[] | null;
  fieldNames: string[] | null;
  outcome: 'allowed' | 'denied';
  reason: string | null;
  at: string;
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
  /** Optional agent confidence in [0, 1], used by automation policies. */
  confidence?: number;
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SCHEMA_NAME_RE = /^ws_[0-9a-f]{32}$/;

export function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new KitsuneError(`Invalid ${label}`, 'validation');
  }
}

export function assertSchemaName(schemaName: string): void {
  if (!SCHEMA_NAME_RE.test(schemaName)) {
    throw new KitsuneError(`Invalid schema name: ${schemaName}`, 'validation');
  }
}

export function escapeSqlStringLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

export function schemaNameForWorkspace(workspaceId: string): string {
  assertUuid(workspaceId, 'workspaceId');
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
