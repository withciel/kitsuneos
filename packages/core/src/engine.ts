import type { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  type BlobStore,
  createDefaultBlobStore,
  sha256Hex,
} from './attachments/blob-store.js';
import type {
  AttachmentMeta,
  PutAttachmentInput,
} from './attachments/types.js';
import { writeAudit, writeAuditInTxn } from './audit/log.js';
import { assertWriteEntitlement } from './billing/entitlement.js';
import { compilePredicate } from './compiler/predicate-sql.js';
import {
  type CollectionMeta,
  compileQuery,
  compileReadRecord,
  getCollectionMeta,
} from './compiler/query.js';
import {
  createPools,
  queryOne,
  queryRows,
  setSessionContext,
  withOwner,
} from './db/pool.js';
import {
  generateAddFieldDdl,
  generateCollectionDdl,
  generateDropFieldDdl,
  generateEmbeddingDdl,
  generateSetIndexedDdl,
  generateWorkspaceSchemaDdl,
} from './ddl/generator.js';
import { assertFieldAllowed, loadResolvedGrant } from './grants/resolve.js';
import type { IngestRequest, IngestResult } from './ingest/types.js';
import {
  getChangedFieldsSince,
  getRevisionAtTime,
  getRevisionSnapshot,
  writeRevision,
} from './revisions/write.js';
import {
  sweepExpiredRevisions,
  type SweepRevisionsResult,
} from './revisions/sweep.js';
import {
  validateCollectionDefinition,
  validateFieldDefinition,
} from './schema/validate-definition.js';
import type { Embedder } from './search/embedder.js';
import { createDefaultEmbedder } from './search/openai-embedder.js';
import { listRelatedRecords, type RelatedResult } from './search/related.js';
import {
  type SearchRequest,
  type SearchResult,
  searchCollections,
  upsertRecordEmbeddings,
} from './search/search.js';
import type {
  AuditQuery,
  AuditRow,
  Capability,
  ChangeOpInput,
  CollectionDefinition,
  DbConfig,
  JsonValue,
  Predicate,
  ProposeChangeSetInput,
  QueryRequest,
  ResolvedGrant,
  ReviewDecision,
  RevisionSummary,
  SchemaChangeInput,
} from './types.js';
import {
  CAPABILITY_ORDER,
  KitsuneError,
  quoteIdent,
  schemaNameForWorkspace,
} from './types.js';
import {
  fieldFileName,
  parseVfsPath,
  serializeField,
  type VfsListEntry,
  type VfsListResult,
  type VfsReadResult,
} from './vfs/paths.js';

export interface ApplyFaultInjection {
  afterOpIndex?: number;
}

export interface EngineOptions {
  config?: DbConfig;
  applyFaultInjection?: ApplyFaultInjection | null;
  appPoolMax?: number;
  ownerPoolMax?: number;
  /**
   * Defaults to createDefaultEmbedder(): DeterministicEmbedder unless
   * KITSUNE_EMBEDDING_PROVIDER=openai (+ OPENAI_API_KEY).
   */
  embedder?: Embedder;
  /** When true (default), reindex prose embeddings in-process after writes. */
  embedSync?: boolean;
  /** Content-addressed blob store for attachments (local dir by default). */
  blobStore?: BlobStore;
}

interface ApplyOp {
  id: string;
  collection_id: string;
  record_id: string | null;
  op: string;
  field_name: string | null;
  base_revision: number | null;
  new_value: JsonValue;
  status: string;
  seq: number;
  collection_name: string;
  table_name: string;
}

const DEFAULT_CONFIG: DbConfig = {
  ownerUrl:
    process.env.KITSUNE_OWNER_URL ??
    'postgresql://kitsune_owner:kitsune_owner@localhost:5432/kitsune',
  appUrl:
    process.env.KITSUNE_APP_URL ??
    'postgresql://kitsune_app:kitsune_app@localhost:5432/kitsune',
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const APPLY_LOCK_TIMEOUT_MS = Number(
  process.env.KITSUNE_APPLY_LOCK_TIMEOUT_MS ?? 5000,
);
const APPLY_LOCK_RETRIES = 1;
/** Postgres raises this when lock_timeout expires. */
const LOCK_NOT_AVAILABLE = '55P03';

function applyLockTimeoutLiteral(): string {
  const ms = Number(APPLY_LOCK_TIMEOUT_MS);
  if (!Number.isFinite(ms) || ms < 0) {
    return '5000ms';
  }
  return `${Math.floor(ms)}ms`;
}

export class KitsuneEngine {
  readonly ownerPool: Pool;
  readonly appPool: Pool;
  applyFaultInjection: ApplyFaultInjection | null = null;
  readonly embedder: Embedder;
  readonly embedSync: boolean;
  readonly blobStore: BlobStore;

  constructor(options: EngineOptions = {}) {
    const config = options.config ?? DEFAULT_CONFIG;
    const pools = createPools(config, {
      appMax: options.appPoolMax,
      ownerMax: options.ownerPoolMax,
    });
    this.ownerPool = pools.ownerPool;
    this.appPool = pools.appPool;
    this.applyFaultInjection = options.applyFaultInjection ?? null;
    this.embedder = options.embedder ?? createDefaultEmbedder();
    this.embedSync = options.embedSync ?? true;
    this.blobStore = options.blobStore ?? createDefaultBlobStore();
  }

  async close(): Promise<void> {
    await this.ownerPool.end();
    await this.appPool.end();
  }

  async createWorkspace(
    slug: string,
    options?: { workspaceId?: string },
  ): Promise<{ workspaceId: string; schemaName: string }> {
    const workspaceId = options?.workspaceId ?? uuidv4();
    const schemaName = schemaNameForWorkspace(workspaceId);
    await withOwner(this.ownerPool, async (client) => {
      for (const stmt of generateWorkspaceSchemaDdl(schemaName)) {
        await client.query(stmt);
      }
      await client.query(
        `INSERT INTO kitsune.workspaces (id, slug, schema_name) VALUES ($1, $2, $3)`,
        [workspaceId, slug, schemaName],
      );
    });
    return { workspaceId, schemaName };
  }

  async createPrincipal(
    workspaceId: string,
    kind: 'human' | 'agent' | 'service',
    displayName: string,
    options?: { principalId?: string },
  ): Promise<string> {
    const id = options?.principalId ?? uuidv4();
    await withOwner(this.ownerPool, async (client) => {
      await client.query(
        `INSERT INTO kitsune.principals (id, workspace_id, kind, display_name)
         VALUES ($1, $2, $3, $4)`,
        [id, workspaceId, kind, displayName],
      );
    });
    return id;
  }

  async defineCollection(
    workspaceId: string,
    definition: CollectionDefinition,
  ): Promise<string> {
    await assertWriteEntitlement(this.ownerPool, workspaceId);
    validateCollectionDefinition(definition);
    const schemaName = schemaNameForWorkspace(workspaceId);
    const collectionId = uuidv4();
    const tableName = definition.name;

    await withOwner(this.ownerPool, async (client) => {
      const existingCollections = await queryRows<{
        id: string;
        name: string;
        table_name: string;
      }>(
        client,
        `SELECT id, name, table_name FROM kitsune.collections WHERE workspace_id = $1`,
        [workspaceId],
      );

      const relationTargets = new Map<
        string,
        { schemaName: string; tableName: string }
      >();
      for (const field of definition.fields) {
        if (field.type === 'relation' && field.relationTarget) {
          const target = existingCollections.find(
            (c) => c.name === field.relationTarget,
          );
          if (!target) {
            throw new KitsuneError(
              `Relation target not found: ${field.relationTarget}`,
              'validation',
            );
          }
          relationTargets.set(field.name, {
            schemaName,
            tableName: target.table_name,
          });
        }
      }

      await client.query(
        `INSERT INTO kitsune.collections (id, workspace_id, name, table_name)
         VALUES ($1, $2, $3, $4)`,
        [collectionId, workspaceId, definition.name, tableName],
      );

      for (const field of definition.fields) {
        let relationTargetId: string | null = null;
        if (field.type === 'relation' && field.relationTarget) {
          const target = existingCollections.find(
            (c) => c.name === field.relationTarget,
          );
          relationTargetId = target?.id ?? null;
        }
        await client.query(
          `INSERT INTO kitsune.fields
            (id, collection_id, name, type, nullable, relation_target, relation_kind, enum_values, indexed)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            uuidv4(),
            collectionId,
            field.name,
            field.type,
            field.nullable ?? true,
            relationTargetId,
            field.type === 'relation' ? 'many_to_one' : null,
            field.enumValues ?? null,
            field.indexed ?? false,
          ],
        );
      }

      for (const stmt of generateCollectionDdl(
        schemaName,
        tableName,
        definition.fields,
        relationTargets,
      )) {
        await client.query(stmt);
      }
    });

    return collectionId;
  }

  async createGrant(
    workspaceId: string,
    principalId: string,
    collectionId: string,
    capability: Capability,
    fieldMask: string[] | null,
    rowPredicate: Predicate | null,
    options?: { adminOverrideAgentWrite?: boolean; actorId?: string },
  ): Promise<string> {
    const grantId = uuidv4();
    await withOwner(this.ownerPool, async (client) => {
      const principal = await queryOne<{ kind: string }>(
        client,
        `SELECT kind FROM kitsune.principals WHERE id = $1`,
        [principalId],
      );
      if (!principal) {
        throw new KitsuneError('Principal not found', 'not_found');
      }

      if (
        principal.kind === 'agent' &&
        CAPABILITY_ORDER.indexOf(capability) >=
          CAPABILITY_ORDER.indexOf('write')
      ) {
        if (!options?.adminOverrideAgentWrite) {
          throw new KitsuneError(
            'Agent principals cannot be granted write without explicit admin action',
            'forbidden',
          );
        }
      }

      await client.query(
        `INSERT INTO kitsune.grants
          (id, workspace_id, principal_id, collection_id, capability, field_mask, row_predicate)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          grantId,
          workspaceId,
          principalId,
          collectionId,
          capability,
          fieldMask,
          rowPredicate ? JSON.stringify(rowPredicate) : null,
        ],
      );
    });

    if (options?.actorId) {
      let principalKind: string | undefined;
      if (
        CAPABILITY_ORDER.indexOf(capability) >=
          CAPABILITY_ORDER.indexOf('write') &&
        options.adminOverrideAgentWrite
      ) {
        await withOwner(this.ownerPool, async (client) => {
          const principal = await queryOne<{ kind: string }>(
            client,
            `SELECT kind FROM kitsune.principals WHERE id = $1`,
            [principalId],
          );
          principalKind = principal?.kind;
        });
        if (principalKind === 'agent') {
          await writeAudit(this.appPool, {
            workspaceId,
            principalId: options.actorId,
            action: 'grant.agent_write_override',
            collectionId,
            outcome: 'allowed',
            detail: { targetPrincipalId: principalId, capability },
          });
        }
      }
      await writeAudit(this.appPool, {
        workspaceId,
        principalId: options.actorId,
        action: 'grant.create',
        collectionId,
        outcome: 'allowed',
        detail: { grantId, targetPrincipalId: principalId, capability },
      });
    }

    return grantId;
  }

  async revokeGrant(
    grantId: string,
    actorId: string,
    workspaceId: string,
  ): Promise<void> {
    const result = await withOwner(this.ownerPool, async (client) => {
      return client.query(
        `UPDATE kitsune.grants SET revoked_at = now()
          WHERE id = $1 AND workspace_id = $2 AND revoked_at IS NULL`,
        [grantId, workspaceId],
      );
    });
    if (result.rowCount === 0) {
      throw new KitsuneError('Not found', 'not_found');
    }
    await writeAudit(this.appPool, {
      workspaceId,
      principalId: actorId,
      action: 'grant.revoke',
      outcome: 'allowed',
      detail: { grantId },
    });
  }

  async describeSchema(workspaceId: string, principalId: string) {
    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId });
      const collections = await queryRows<{ id: string; name: string }>(
        client,
        `SELECT id, name FROM kitsune.collections WHERE workspace_id = $1 ORDER BY name`,
        [workspaceId],
      );
      const result = [];
      for (const collection of collections) {
        const grant = await loadResolvedGrant(
          client,
          principalId,
          collection.id,
        );
        if (!grant || grant.capability === 'none') {
          continue;
        }
        const fields = await queryRows<{
          name: string;
          type: string;
          relation_target: string | null;
        }>(
          client,
          `SELECT f.name, f.type, target.name AS relation_target
             FROM kitsune.fields f
             LEFT JOIN kitsune.collections target ON target.id = f.relation_target
            WHERE f.collection_id = $1
            ORDER BY f.name`,
          [collection.id],
        );
        const visibleFields = fields.filter(
          (f) => grant.fieldMask === null || grant.fieldMask.includes(f.name),
        );
        if (visibleFields.length === 0) {
          continue;
        }
        result.push({
          name: collection.name,
          capability: grant.capability,
          fields: visibleFields.map((f) => ({
            name: f.name,
            type: f.type,
            relationTarget: f.relation_target,
            readable: true,
            writable:
              grant.fieldMask === null || grant.fieldMask.includes(f.name)
                ? CAPABILITY_ORDER.indexOf(grant.capability) >=
                  CAPABILITY_ORDER.indexOf('propose')
                : false,
          })),
        });
      }
      await client.query('COMMIT');
      return { collections: result };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async query(
    workspaceId: string,
    principalId: string,
    request: QueryRequest,
  ): Promise<Record<string, JsonValue>[]> {
    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId });
      const compiled = await compileQuery(
        client,
        workspaceId,
        principalId,
        schemaName,
        request,
      );
      const rows = await queryRows<Record<string, JsonValue>>(
        client,
        compiled.sql,
        compiled.params,
      );
      await writeAuditInTxn(client, {
        workspaceId,
        principalId,
        action: 'query',
        outcome: 'allowed',
        detail: { collection: request.collection },
      });
      await client.query('COMMIT');
      return rows;
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof KitsuneError && error.code === 'forbidden') {
        await writeAudit(this.appPool, {
          workspaceId,
          principalId,
          action: 'query',
          outcome: 'denied',
          reason: error.message,
          detail: { collection: request.collection },
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async readRecord(
    workspaceId: string,
    principalId: string,
    collection: string,
    recordId: string,
    fields?: string[],
  ): Promise<Record<string, JsonValue> | null> {
    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId });
      const compiled = await compileReadRecord(
        client,
        workspaceId,
        principalId,
        schemaName,
        collection,
        recordId,
        fields,
      );
      const row = await queryOne<Record<string, JsonValue>>(
        client,
        compiled.sql,
        compiled.params,
      );
      await writeAuditInTxn(client, {
        workspaceId,
        principalId,
        action: 'read_record',
        recordIds: [recordId],
        outcome: row ? 'allowed' : 'denied',
      });
      await client.query('COMMIT');
      return row;
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof KitsuneError) {
        await writeAudit(this.appPool, {
          workspaceId,
          principalId,
          action: 'read_record',
          recordIds: [recordId],
          outcome: 'denied',
          reason: error.message,
        });
        if (error.code === 'forbidden' || error.code === 'not_found') {
          return null;
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async search(
    workspaceId: string,
    principalId: string,
    request: SearchRequest,
  ): Promise<SearchResult> {
    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId });
      const result = await searchCollections(
        client,
        workspaceId,
        principalId,
        schemaName,
        this.embedder,
        request,
      );
      await writeAuditInTxn(client, {
        workspaceId,
        principalId,
        action: 'search',
        outcome: 'allowed',
        detail: {
          collections: request.collections ?? null,
          hitCount: result.hits.length,
        },
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listRelated(
    workspaceId: string,
    principalId: string,
    collection: string,
    recordId: string,
  ): Promise<RelatedResult> {
    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId });
      const result = await listRelatedRecords(
        client,
        workspaceId,
        principalId,
        schemaName,
        collection,
        recordId,
      );
      await writeAuditInTxn(client, {
        workspaceId,
        principalId,
        action: 'list_related',
        recordIds: [recordId],
        outcome: 'allowed',
        detail: { collection },
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Read-only virtual filesystem projection of grant-visible records.
   * Paths: `/`, `/<collection>`, `/<collection>/<recordId>`,
   * `/<collection>/<recordId>/<field>.md|json`. Writes still go through
   * propose/directWrite — never raw file overwrite.
   */
  async vfsList(
    workspaceId: string,
    principalId: string,
    path: string,
  ): Promise<VfsListResult> {
    const parsed = parseVfsPath(path);

    if (parsed.kind === 'field') {
      throw new KitsuneError(
        'Cannot list a file path; use vfsRead',
        'validation',
      );
    }

    if (parsed.kind === 'root') {
      const schema = await this.describeSchema(workspaceId, principalId);
      return {
        path: '/',
        entries: schema.collections.map((c) => ({
          name: c.name,
          type: 'dir' as const,
          path: `/${c.name}`,
        })),
      };
    }

    if (parsed.kind === 'collection') {
      const rows = await this.query(workspaceId, principalId, {
        collection: parsed.collection,
        fields: [],
        limit: 100,
      });
      return {
        path: `/${parsed.collection}`,
        entries: rows
          .filter((row): row is { id: string } => typeof row.id === 'string')
          .map((row) => ({
            name: row.id,
            type: 'dir' as const,
            path: `/${parsed.collection}/${row.id}`,
          })),
      };
    }

    // record
    const schema = await this.describeSchema(workspaceId, principalId);
    const collectionMeta = schema.collections.find(
      (c) => c.name === parsed.collection,
    );
    if (!collectionMeta) {
      throw new KitsuneError('Not found', 'not_found');
    }
    const record = await this.readRecord(
      workspaceId,
      principalId,
      parsed.collection,
      parsed.recordId,
    );
    if (!record) {
      throw new KitsuneError('Not found', 'not_found');
    }
    const entries: VfsListEntry[] = collectionMeta.fields.map((f) => {
      const name = fieldFileName(f.name, f.type);
      return {
        name,
        type: 'file' as const,
        path: `/${parsed.collection}/${parsed.recordId}/${name}`,
      };
    });
    return {
      path: `/${parsed.collection}/${parsed.recordId}`,
      entries,
    };
  }

  async vfsRead(
    workspaceId: string,
    principalId: string,
    path: string,
  ): Promise<VfsReadResult> {
    const parsed = parseVfsPath(path);
    if (parsed.kind !== 'field') {
      throw new KitsuneError(
        'vfsRead requires a field file path',
        'validation',
      );
    }

    const schema = await this.describeSchema(workspaceId, principalId);
    const collectionMeta = schema.collections.find(
      (c) => c.name === parsed.collection,
    );
    if (!collectionMeta) {
      throw new KitsuneError('Not found', 'not_found');
    }
    const fieldMeta = collectionMeta.fields.find(
      (f) => f.name === parsed.field,
    );
    if (!fieldMeta) {
      throw new KitsuneError('Not found', 'not_found');
    }
    if (parsed.format === 'md' && fieldMeta.type !== 'prose') {
      throw new KitsuneError(
        `Field ${parsed.field} is not prose; use .json`,
        'validation',
      );
    }
    if (parsed.format === 'json' && fieldMeta.type === 'prose') {
      throw new KitsuneError(
        `Field ${parsed.field} is prose; use .md`,
        'validation',
      );
    }

    const record = await this.readRecord(
      workspaceId,
      principalId,
      parsed.collection,
      parsed.recordId,
      [parsed.field],
    );
    if (!record) {
      throw new KitsuneError('Not found', 'not_found');
    }

    return {
      path: `/${parsed.collection}/${parsed.recordId}/${fieldFileName(parsed.field, fieldMeta.type)}`,
      content: serializeField(record[parsed.field], parsed.format),
      contentType:
        parsed.format === 'md' ? 'text/markdown' : 'application/json',
    };
  }

  /**
   * Upsert records into a collection. Agents (propose) get change sets;
   * write/admin principals direct-write. No vendor SDKs — callers parse
   * CMS/CRM/KB/ticket payloads into records first.
   */
  async ingest(
    workspaceId: string,
    principalId: string,
    request: IngestRequest,
  ): Promise<IngestResult> {
    if (!request.collection) {
      throw new KitsuneError('collection is required', 'validation');
    }
    if (!request.records?.length) {
      throw new KitsuneError('records are required', 'validation');
    }

    const schema = await this.describeSchema(workspaceId, principalId);
    const collectionMeta = schema.collections.find(
      (c) => c.name === request.collection,
    );
    if (!collectionMeta) {
      throw new KitsuneError('Not found', 'not_found');
    }

    const capability = collectionMeta.capability;
    const mode = request.mode ?? 'auto';
    let useDirect = false;
    if (mode === 'direct') {
      useDirect =
        CAPABILITY_ORDER.indexOf(capability) >=
        CAPABILITY_ORDER.indexOf('write');
      if (!useDirect) {
        throw new KitsuneError('Write capability required', 'forbidden');
      }
    } else if (mode === 'propose') {
      useDirect = false;
      if (
        CAPABILITY_ORDER.indexOf(capability) <
        CAPABILITY_ORDER.indexOf('propose')
      ) {
        throw new KitsuneError('Propose capability required', 'forbidden');
      }
    } else {
      useDirect =
        CAPABILITY_ORDER.indexOf(capability) >=
        CAPABILITY_ORDER.indexOf('write');
      if (
        !useDirect &&
        CAPABILITY_ORDER.indexOf(capability) <
          CAPABILITY_ORDER.indexOf('propose')
      ) {
        throw new KitsuneError('Not found', 'not_found');
      }
    }

    const result: IngestResult = {
      written: [],
      changeSetIds: [],
      errors: [],
    };

    for (let index = 0; index < request.records.length; index++) {
      const record = request.records[index]!;
      try {
        const fieldNames = Object.keys(record.fields);
        if (fieldNames.length === 0) {
          throw new KitsuneError('Record has no fields', 'validation');
        }

        if (useDirect) {
          if (record.id) {
            const existing = await this.readRecord(
              workspaceId,
              principalId,
              request.collection,
              record.id,
            );
            if (existing) {
              // Patch via propose+apply is heavy; use propose for updates when
              // we lack a direct update API. Prefer change set for updates.
              const ops: ChangeOpInput[] = fieldNames.map((fieldName) => ({
                collection: request.collection,
                recordId: record.id,
                op: 'update' as const,
                fieldName,
                newValue: record.fields[fieldName]!,
              }));
              // Humans with write: propose then self-approve/apply (no directUpdate API).
              const proposed = await this.proposeChangeSet(
                workspaceId,
                principalId,
                {
                  title: `Ingest update ${request.collection}`,
                  rationale: 'ingest upsert',
                  operations: ops,
                },
              );
              if (
                CAPABILITY_ORDER.indexOf(capability) >=
                CAPABILITY_ORDER.indexOf('write')
              ) {
                await this.reviewChangeSet(
                  workspaceId,
                  principalId,
                  proposed.changeSetId,
                  proposed.operationIds.map((opId) => ({
                    opId,
                    status: 'approved' as const,
                  })),
                );
                await this.applyChangeSet(
                  workspaceId,
                  principalId,
                  proposed.changeSetId,
                );
                result.written.push(record.id);
              } else {
                result.changeSetIds.push(proposed.changeSetId);
              }
            } else {
              const id = await this.directWrite(
                workspaceId,
                principalId,
                request.collection,
                record.fields,
                { recordId: record.id },
              );
              result.written.push(id);
            }
          } else {
            const id = await this.directWrite(
              workspaceId,
              principalId,
              request.collection,
              record.fields,
            );
            result.written.push(id);
          }
        } else {
          const recordId = record.id ?? uuidv4();
          const existing = record.id
            ? await this.readRecord(
                workspaceId,
                principalId,
                request.collection,
                record.id,
              )
            : null;
          const ops: ChangeOpInput[] = fieldNames.map((fieldName) => ({
            collection: request.collection,
            recordId,
            op: existing ? ('update' as const) : ('insert' as const),
            fieldName,
            newValue: record.fields[fieldName]!,
          }));
          const proposed = await this.proposeChangeSet(
            workspaceId,
            principalId,
            {
              title: `Ingest ${request.collection}`,
              rationale: 'ingest via propose',
              operations: ops,
            },
          );
          result.changeSetIds.push(proposed.changeSetId);
        }
      } catch (error) {
        result.errors.push({
          index,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Store a binary blob in object storage and attach metadata to a record field.
   * Records stay in Postgres; blobs are content-addressed. Requires write/admin
   * and a field mask that includes `fieldName`.
   */
  async putAttachment(
    workspaceId: string,
    principalId: string,
    input: PutAttachmentInput,
  ): Promise<AttachmentMeta> {
    if (!input.collection || !input.recordId || !input.fieldName) {
      throw new KitsuneError(
        'collection, recordId, and fieldName are required',
        'validation',
      );
    }
    if (!UUID_PATTERN.test(input.recordId)) {
      throw new KitsuneError('recordId must be a UUID', 'validation');
    }
    if (!input.contentBase64) {
      throw new KitsuneError('contentBase64 is required', 'validation');
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.contentBase64, 'base64');
    } catch {
      throw new KitsuneError('contentBase64 is invalid', 'validation');
    }
    if (bytes.length === 0) {
      throw new KitsuneError(
        'attachment content must be non-empty',
        'validation',
      );
    }
    const contentType = input.contentType?.trim() || 'application/octet-stream';
    const contentHash = sha256Hex(bytes);

    const visible = await this.readRecord(
      workspaceId,
      principalId,
      input.collection,
      input.recordId,
    );
    if (!visible) {
      throw new KitsuneError('Not found', 'not_found');
    }

    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId });
      const meta = await getCollectionMeta(
        client,
        workspaceId,
        input.collection,
      );
      if (!meta.fields.includes(input.fieldName)) {
        throw new KitsuneError(
          `Unknown field: ${input.fieldName}`,
          'validation',
        );
      }
      const grant = await loadResolvedGrant(client, principalId, meta.id);
      if (
        !grant ||
        CAPABILITY_ORDER.indexOf(grant.capability) <
          CAPABILITY_ORDER.indexOf('write')
      ) {
        throw new KitsuneError('Not found', 'not_found');
      }
      assertFieldAllowed(grant, input.fieldName, 'write');

      // Write blob before metadata so a failed insert never points at missing bytes.
      await this.blobStore.put(contentHash, bytes);

      const attachmentId = uuidv4();
      const inserted = await client.query<{
        id: string;
        collection_id: string;
        record_id: string;
        field_name: string;
        content_hash: string;
        content_type: string;
        byte_size: string;
        file_name: string | null;
        created_at: Date;
      }>(
        `INSERT INTO kitsune.attachments (
           id, workspace_id, collection_id, record_id, field_name,
           content_hash, content_type, byte_size, file_name, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (workspace_id, collection_id, record_id, field_name, content_hash)
         DO NOTHING
         RETURNING id, collection_id, record_id, field_name, content_hash,
                   content_type, byte_size::text, file_name, created_at`,
        [
          attachmentId,
          workspaceId,
          meta.id,
          input.recordId,
          input.fieldName,
          contentHash,
          contentType,
          bytes.length,
          input.fileName ?? null,
          principalId,
        ],
      );

      let row = inserted.rows[0];
      if (!row) {
        const existing = await client.query<{
          id: string;
          collection_id: string;
          record_id: string;
          field_name: string;
          content_hash: string;
          content_type: string;
          byte_size: string;
          file_name: string | null;
          created_at: Date;
        }>(
          `SELECT id, collection_id, record_id, field_name, content_hash,
                  content_type, byte_size::text, file_name, created_at
           FROM kitsune.attachments
           WHERE workspace_id = $1 AND collection_id = $2 AND record_id = $3
             AND field_name = $4 AND content_hash = $5`,
          [workspaceId, meta.id, input.recordId, input.fieldName, contentHash],
        );
        row = existing.rows[0];
      }
      if (!row) {
        throw new KitsuneError('Attachment insert failed', 'internal');
      }

      await writeAuditInTxn(client, {
        workspaceId,
        principalId,
        action: 'put_attachment',
        collectionId: meta.id,
        recordIds: [input.recordId],
        fieldNames: [input.fieldName],
        outcome: 'allowed',
        detail: { attachmentId: row.id, contentHash },
      });
      await client.query('COMMIT');
      return {
        id: row.id,
        collection: input.collection,
        recordId: row.record_id,
        fieldName: row.field_name,
        contentHash: row.content_hash,
        contentType: row.content_type,
        byteSize: Number(row.byte_size),
        fileName: row.file_name,
        createdAt: row.created_at.toISOString(),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listAttachments(
    workspaceId: string,
    principalId: string,
    input: { collection: string; recordId: string; fieldName?: string },
  ): Promise<AttachmentMeta[]> {
    if (!UUID_PATTERN.test(input.recordId)) {
      throw new KitsuneError('recordId must be a UUID', 'validation');
    }

    const visible = await this.readRecord(
      workspaceId,
      principalId,
      input.collection,
      input.recordId,
    );
    if (!visible) {
      return [];
    }

    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId });
      const meta = await getCollectionMeta(
        client,
        workspaceId,
        input.collection,
      );
      const grant = await loadResolvedGrant(client, principalId, meta.id);
      if (
        !grant ||
        CAPABILITY_ORDER.indexOf(grant.capability) <
          CAPABILITY_ORDER.indexOf('read')
      ) {
        await client.query('ROLLBACK');
        return [];
      }

      const result = await client.query<{
        id: string;
        record_id: string;
        field_name: string;
        content_hash: string;
        content_type: string;
        byte_size: string;
        file_name: string | null;
        created_at: Date;
      }>(
        `SELECT id, record_id, field_name, content_hash, content_type,
                byte_size::text, file_name, created_at
         FROM kitsune.attachments
         WHERE workspace_id = $1 AND collection_id = $2 AND record_id = $3
         ORDER BY created_at ASC`,
        [workspaceId, meta.id, input.recordId],
      );
      await client.query('COMMIT');

      return result.rows
        .filter((row) => {
          if (input.fieldName && row.field_name !== input.fieldName) {
            return false;
          }
          try {
            assertFieldAllowed(grant, row.field_name, 'read');
            return true;
          } catch {
            return false;
          }
        })
        .map((row) => ({
          id: row.id,
          collection: input.collection,
          recordId: row.record_id,
          fieldName: row.field_name,
          contentHash: row.content_hash,
          contentType: row.content_type,
          byteSize: Number(row.byte_size),
          fileName: row.file_name,
          createdAt: row.created_at.toISOString(),
        }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Fetch attachment metadata + bytes. Returns null when the attachment is
   * missing or the caller cannot read the parent record/field (indistinguishable).
   * Download access is grant-gated here — no unsigned public blob URLs.
   */
  async getAttachment(
    workspaceId: string,
    principalId: string,
    attachmentId: string,
  ): Promise<{ meta: AttachmentMeta; contentBase64: string } | null> {
    if (!UUID_PATTERN.test(attachmentId)) {
      throw new KitsuneError('attachmentId must be a UUID', 'validation');
    }

    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    let metaRow: {
      id: string;
      collection_id: string;
      record_id: string;
      field_name: string;
      content_hash: string;
      content_type: string;
      byte_size: string;
      file_name: string | null;
      created_at: Date;
      collection_name: string;
    } | null = null;
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId });
      const result = await client.query<{
        id: string;
        collection_id: string;
        record_id: string;
        field_name: string;
        content_hash: string;
        content_type: string;
        byte_size: string;
        file_name: string | null;
        created_at: Date;
        collection_name: string;
      }>(
        `SELECT a.id, a.collection_id, a.record_id, a.field_name, a.content_hash,
                a.content_type, a.byte_size::text, a.file_name, a.created_at,
                c.name AS collection_name
         FROM kitsune.attachments a
         JOIN kitsune.collections c ON c.id = a.collection_id
         WHERE a.id = $1 AND a.workspace_id = $2`,
        [attachmentId, workspaceId],
      );
      metaRow = result.rows[0] ?? null;
      if (!metaRow) {
        await client.query('COMMIT');
        return null;
      }

      const grant = await loadResolvedGrant(
        client,
        principalId,
        metaRow.collection_id,
      );
      if (
        !grant ||
        CAPABILITY_ORDER.indexOf(grant.capability) <
          CAPABILITY_ORDER.indexOf('read')
      ) {
        await client.query('COMMIT');
        return null;
      }
      try {
        assertFieldAllowed(grant, metaRow.field_name, 'read');
      } catch {
        await client.query('COMMIT');
        return null;
      }
      await writeAuditInTxn(client, {
        workspaceId,
        principalId,
        action: 'get_attachment',
        collectionId: metaRow.collection_id,
        recordIds: [metaRow.record_id],
        fieldNames: [metaRow.field_name],
        outcome: 'allowed',
        detail: { attachmentId },
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (!metaRow) return null;

    const visible = await this.readRecord(
      workspaceId,
      principalId,
      metaRow.collection_name,
      metaRow.record_id,
    );
    if (!visible) return null;

    const bytes = await this.blobStore.get(metaRow.content_hash);
    return {
      meta: {
        id: metaRow.id,
        collection: metaRow.collection_name,
        recordId: metaRow.record_id,
        fieldName: metaRow.field_name,
        contentHash: metaRow.content_hash,
        contentType: metaRow.content_type,
        byteSize: Number(metaRow.byte_size),
        fileName: metaRow.file_name,
        createdAt: metaRow.created_at.toISOString(),
      },
      contentBase64: bytes.toString('base64'),
    };
  }

  /** Reindex prose embeddings for one record. Safe to call on collections created before R9. */
  async reindexRecord(
    workspaceId: string,
    collection: string,
    recordId: string,
  ): Promise<void> {
    const schemaName = schemaNameForWorkspace(workspaceId);
    await withOwner(this.ownerPool, async (owner) => {
      const meta = await getCollectionMeta(owner, workspaceId, collection);
      for (const stmt of generateEmbeddingDdl(schemaName, meta.tableName)) {
        await owner.query(stmt);
      }
      const proseNames = meta.fieldMeta
        .filter((f) => f.type === 'prose')
        .map((f) => f.name);
      if (proseNames.length === 0) {
        await upsertRecordEmbeddings(
          owner,
          schemaName,
          meta.tableName,
          recordId,
          [],
          this.embedder,
        );
        return;
      }
      const cols = proseNames.map((n) => quoteIdent(n)).join(', ');
      const row = await queryOne<Record<string, unknown>>(
        owner,
        `SELECT ${cols} FROM ${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)}
         WHERE id = $1 AND _deleted_at IS NULL`,
        [recordId],
      );
      const fields: Array<{ name: string; content: string }> = [];
      if (row) {
        for (const name of proseNames) {
          const value = row[name];
          if (typeof value === 'string' && value.trim()) {
            fields.push({ name, content: value });
          }
        }
      }
      await upsertRecordEmbeddings(
        owner,
        schemaName,
        meta.tableName,
        recordId,
        fields,
        this.embedder,
      );
    });
  }

  private async maybeReindexAfterWrite(
    workspaceId: string,
    collection: string,
    recordId: string,
  ): Promise<void> {
    if (!this.embedSync) return;
    const client = await this.appPool.connect();
    try {
      const meta = await getCollectionMeta(client, workspaceId, collection);
      if (!meta.fieldMeta.some((f) => f.type === 'prose')) return;
    } finally {
      client.release();
    }
    await this.reindexRecord(workspaceId, collection, recordId);
  }

  /**
   * A relation value points at a row the author may not be allowed to see. Left to the
   * foreign key, the deferred constraint answers "does this row exist?" at COMMIT, which
   * distinguishes a hidden record from an absent one. Resolving the target through the
   * author's own grant collapses both cases to the same not-found error.
   */
  private async assertRelationTargetAccessible(
    client: PoolClient,
    workspaceId: string,
    authorId: string,
    schemaName: string,
    meta: CollectionMeta,
    op: NormalizedOp,
    pendingRecordIds: Set<string>,
  ): Promise<void> {
    if (op.op === 'delete' || !op.fieldName) {
      return;
    }
    const field = meta.fieldMeta.find((f) => f.name === op.fieldName);
    if (!field || field.type !== 'relation' || !field.relationTarget) {
      return;
    }
    if (op.newValue === null || op.newValue === undefined) {
      return;
    }

    const targetId = String(op.newValue);
    if (pendingRecordIds.has(`${field.relationTarget}:${targetId}`)) {
      return;
    }
    if (!UUID_PATTERN.test(targetId)) {
      throw new KitsuneError('Not found', 'not_found');
    }

    const targetMeta = await getCollectionMeta(
      client,
      workspaceId,
      field.relationTarget,
    );
    const targetGrant = await loadResolvedGrant(
      client,
      authorId,
      targetMeta.id,
    );
    if (!targetGrant) {
      throw new KitsuneError('Not found', 'not_found');
    }
    await assertRowAccessible(
      client,
      workspaceId,
      authorId,
      schemaName,
      targetMeta,
      targetGrant,
      targetId,
    );
  }

  async proposeChangeSet(
    workspaceId: string,
    authorId: string,
    input: ProposeChangeSetInput,
  ): Promise<{ changeSetId: string; operationIds: string[] }> {
    await assertWriteEntitlement(this.ownerPool, workspaceId);
    const schemaName = schemaNameForWorkspace(workspaceId);
    const changeSetId = uuidv4();
    const operationIds: string[] = [];

    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, {
        schemaName,
        principalId: authorId,
        includeDeleted: true,
      });

      const normalizedOps = normalizeOperations(input.operations);

      // Records created by this same change set are legitimate relation targets even
      // though they do not exist yet, so collect them before validating relations.
      const pendingRecordIds = new Set(
        normalizedOps
          .filter((op) => op.op === 'insert' && op.recordId)
          .map((op) => `${op.collection}:${op.recordId}`),
      );

      for (const op of normalizedOps) {
        const meta = await getCollectionMeta(
          client,
          workspaceId,
          op.collection,
        );
        const grant = await loadResolvedGrant(client, authorId, meta.id);
        if (!grant) {
          throw new KitsuneError('Not found', 'not_found');
        }

        if (op.op === 'delete') {
          if (
            CAPABILITY_ORDER.indexOf(grant.capability) <
            CAPABILITY_ORDER.indexOf('propose')
          ) {
            throw new KitsuneError('Not found', 'not_found');
          }
        } else if (op.fieldName) {
          assertFieldAllowed(grant, op.fieldName, 'propose');
        }

        if (op.op !== 'insert' && op.recordId) {
          await assertRowAccessible(
            client,
            workspaceId,
            authorId,
            schemaName,
            meta,
            grant,
            op.recordId,
            { includeDeleted: true },
          );
        }

        await this.assertRelationTargetAccessible(
          client,
          workspaceId,
          authorId,
          schemaName,
          meta,
          op,
          pendingRecordIds,
        );
      }

      await client.query(
        `INSERT INTO kitsune.change_sets (id, workspace_id, author_id, status, title, rationale)
         VALUES ($1, $2, $3, 'open', $4, $5)`,
        [
          changeSetId,
          workspaceId,
          authorId,
          input.title ?? null,
          input.rationale ?? null,
        ],
      );

      let seq = 0;
      for (const op of normalizedOps) {
        const meta = await getCollectionMeta(
          client,
          workspaceId,
          op.collection,
        );
        const opId = uuidv4();
        operationIds.push(opId);

        let baseRevision: number | null = null;
        if (op.op !== 'insert' && op.recordId) {
          const table = `${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)}`;
          const current = await queryOne<{
            _revision: number;
            _deleted_at: string | null;
          }>(
            client,
            `SELECT _revision, _deleted_at FROM ${table} WHERE id = $1`,
            [op.recordId],
          );
          if (!current) {
            throw new KitsuneError('Not found', 'not_found');
          }
          baseRevision = current._revision;
        }

        await client.query(
          `INSERT INTO kitsune.change_ops
            (id, change_set_id, collection_id, record_id, op, field_name, base_revision, new_value, seq)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            opId,
            changeSetId,
            meta.id,
            op.recordId ?? null,
            op.op,
            op.fieldName ?? null,
            baseRevision,
            op.newValue !== undefined ? JSON.stringify(op.newValue) : null,
            seq++,
          ],
        );
      }

      await writeAuditInTxn(client, {
        workspaceId,
        principalId: authorId,
        action: 'propose_change_set',
        outcome: 'allowed',
        detail: { changeSetId },
      });

      await client.query('COMMIT');
      return { changeSetId, operationIds };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof KitsuneError && error.code === 'forbidden') {
        await writeAudit(this.appPool, {
          workspaceId,
          principalId: authorId,
          action: 'propose_change_set',
          outcome: 'denied',
          reason: error.message,
          detail: error.details,
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async reviewChangeSet(
    workspaceId: string,
    reviewerId: string,
    changeSetId: string,
    decisions: ReviewDecision[],
  ): Promise<void> {
    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId: reviewerId });
      for (const decision of decisions) {
        await client.query(
          `UPDATE kitsune.change_ops
           SET status = $1, review_comment = $2
           WHERE id = $3 AND change_set_id = $4`,
          [
            decision.status,
            decision.comment ?? null,
            decision.opId,
            changeSetId,
          ],
        );
      }
      await client.query(
        `UPDATE kitsune.change_sets SET decided_by = $1 WHERE id = $2`,
        [reviewerId, changeSetId],
      );
      await writeAuditInTxn(client, {
        workspaceId,
        principalId: reviewerId,
        action: 'review_change_set',
        outcome: 'allowed',
        detail: { changeSetId },
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async applyChangeSet(
    workspaceId: string,
    reviewerId: string,
    changeSetId: string,
  ): Promise<{ status: string; conflicts?: string[] }> {
    await assertWriteEntitlement(this.ownerPool, workspaceId);
    const schemaName = schemaNameForWorkspace(workspaceId);

    const metaClient = await this.appPool.connect();
    let changeSet: {
      author_id: string;
      status: string;
      expires_at: Date;
    };
    let ops: ApplyOp[];
    try {
      changeSet = (await queryOne(
        metaClient,
        `SELECT author_id, status, expires_at FROM kitsune.change_sets WHERE id = $1 AND workspace_id = $2`,
        [changeSetId, workspaceId],
      )) as typeof changeSet;
      if (!changeSet) {
        throw new KitsuneError('Not found', 'not_found');
      }
      if (
        changeSet.status === 'expired' ||
        new Date(changeSet.expires_at) < new Date()
      ) {
        await metaClient.query(
          `UPDATE kitsune.change_sets SET status = 'expired' WHERE id = $1`,
          [changeSetId],
        );
        throw new KitsuneError('Change set expired', 'expired');
      }
      if (changeSet.status !== 'open' && changeSet.status !== 'blocked') {
        throw new KitsuneError(
          `Change set status is ${changeSet.status}`,
          'blocked',
        );
      }

      ops = await queryRows<ApplyOp>(
        metaClient,
        `SELECT o.*, c.name AS collection_name, c.table_name
         FROM kitsune.change_ops o
         JOIN kitsune.collections c ON c.id = o.collection_id
         WHERE o.change_set_id = $1
         ORDER BY o.seq`,
        [changeSetId],
      );

      const undecided = ops.filter((o) => o.status === 'proposed');
      if (undecided.length > 0) {
        throw new KitsuneError(
          'All operations must be approved or rejected before apply',
          'validation',
        );
      }
    } finally {
      metaClient.release();
    }

    const approvedOps = ops.filter((o) => o.status === 'approved');
    if (approvedOps.length === 0) {
      await this.markChangeSetStatus(
        workspaceId,
        reviewerId,
        changeSetId,
        'rejected',
      );
      return { status: 'rejected' };
    }

    const client = await this.appPool.connect();
    const conflicts: string[] = [];
    try {
      await client.query('BEGIN');
      await setSessionContext(client, {
        schemaName,
        principalId: reviewerId,
        includeDeleted: true,
      });

      const lockTargets = [
        ...new Map(
          approvedOps
            .filter((o) => o.record_id)
            .map((o) => [`${o.collection_id}:${o.record_id}`, o]),
        ).values(),
      ].sort((a, b) => {
        const ca = a.collection_id.localeCompare(b.collection_id);
        return ca !== 0
          ? ca
          : (a.record_id ?? '').localeCompare(b.record_id ?? '');
      });

      // Locks are taken row by row in sorted order, so applies cannot deadlock against
      // each other. They can still queue behind an unrelated long transaction, and
      // without a timeout that wait is unbounded. Bound it, and retry the batch once
      // in case the blocker was transient.
      // sql-safe: applyLockTimeoutLiteral returns a coerced non-negative integer
      await client.query(
        `SET LOCAL lock_timeout = '${applyLockTimeoutLiteral()}'`,
      );
      await this.acquireApplyLocks(client, schemaName, reviewerId, lockTargets);

      for (const op of approvedOps) {
        const grant = await loadResolvedGrant(
          client,
          changeSet.author_id,
          op.collection_id,
        );
        if (!grant) {
          await client.query('ROLLBACK');
          await this.markChangeSetStatus(
            workspaceId,
            reviewerId,
            changeSetId,
            'blocked',
          );
          await writeAudit(this.appPool, {
            workspaceId,
            principalId: reviewerId,
            action: 'apply_change_set',
            outcome: 'denied',
            reason: 'Author grant revoked',
            detail: { changeSetId },
          });
          throw new KitsuneError('Author grant revoked', 'blocked');
        }
        if (op.op === 'delete') {
          if (
            CAPABILITY_ORDER.indexOf(grant.capability) <
            CAPABILITY_ORDER.indexOf('propose')
          ) {
            await client.query('ROLLBACK');
            await this.markChangeSetStatus(
              workspaceId,
              reviewerId,
              changeSetId,
              'blocked',
            );
            throw new KitsuneError('Author grant revoked', 'blocked');
          }
        } else if (op.field_name) {
          assertFieldAllowed(grant, op.field_name, 'propose');
        }
      }

      for (const op of approvedOps) {
        if (op.op === 'insert') {
          continue;
        }
        if (!op.record_id) {
          continue;
        }
        const table = `${quoteIdent(schemaName)}.${quoteIdent(op.table_name)}`;
        const current = await queryOne<{
          _revision: number;
          _deleted_at: string | null;
        }>(
          client,
          `SELECT _revision, _deleted_at FROM ${table} WHERE id = $1`,
          [op.record_id],
        );
        if (!current || current._deleted_at) {
          await client.query('ROLLBACK');
          await this.markChangeSetStatus(
            workspaceId,
            reviewerId,
            changeSetId,
            'blocked',
          );
          throw new KitsuneError('Record deleted', 'blocked');
        }

        if (op.base_revision === current._revision) {
          continue;
        }

        const touched = await getChangedFieldsSince(
          client,
          schemaName,
          op.table_name,
          op.record_id,
          op.base_revision ?? 0,
        );
        if (op.field_name && touched.includes(op.field_name)) {
          conflicts.push(op.field_name);
        }
      }

      if (conflicts.length > 0) {
        await client.query('ROLLBACK');
        await this.persistBlockedChangeSet(changeSetId, conflicts, approvedOps);
        await writeAudit(this.appPool, {
          workspaceId,
          principalId: reviewerId,
          action: 'apply_change_set',
          outcome: 'denied',
          reason: 'Field conflict',
          detail: { changeSetId, conflicts },
        });
        return { status: 'blocked', conflicts: [...new Set(conflicts)] };
      }

      const insertGroups = groupInsertOps(
        approvedOps.filter((o) => o.op === 'insert'),
      );
      const updateDeleteOps = approvedOps.filter((o) => o.op !== 'insert');

      let opIndex = 0;
      for (const [, groupOps] of insertGroups) {
        const sample = groupOps[0]!;
        const table = `${quoteIdent(schemaName)}.${quoteIdent(sample.table_name)}`;
        const recordId = sample.record_id ?? uuidv4();
        const row: Record<string, unknown> = {
          id: recordId,
          _revision: 1,
          _updated_by: changeSet.author_id,
        };
        const changedFields: string[] = [];
        for (const op of groupOps) {
          if (op.field_name) {
            row[op.field_name] = op.new_value;
            changedFields.push(op.field_name);
          }
          opIndex++;
          if (this.applyFaultInjection?.afterOpIndex === opIndex) {
            throw new Error('Fault injection: simulated apply failure');
          }
        }
        const cols = Object.keys(row);
        const vals = cols.map((_, i) => `$${i + 1}`);
        await client.query(
          `INSERT INTO ${table} (${cols.map((c) => quoteIdent(c)).join(', ')})
           VALUES (${vals.join(', ')})`,
          cols.map((c) => row[c]),
        );
        await writeRevision(
          client,
          schemaName,
          sample.table_name,
          recordId,
          1,
          row,
          changedFields,
          changeSet.author_id,
          changeSetId,
        );
      }

      const recordGroups = groupRecordOps(updateDeleteOps);
      for (const [, groupOps] of recordGroups) {
        const sample = groupOps[0]!;
        const table = `${quoteIdent(schemaName)}.${quoteIdent(sample.table_name)}`;
        const recordId = sample.record_id!;
        const meta = await getCollectionMeta(
          client,
          workspaceId,
          sample.collection_name,
        );
        const readCols = [
          'id',
          '_revision',
          '_updated_at',
          '_updated_by',
          '_deleted_at',
          ...meta.fields,
        ]
          .map((c) => quoteIdent(c))
          .join(', ');
        const current = await queryOne<Record<string, unknown>>(
          client,
          `SELECT ${readCols} FROM ${table} WHERE id = $1`,
          [recordId],
        );
        if (!current) {
          throw new KitsuneError('Record not found during apply', 'blocked');
        }

        const isDelete = groupOps.some((o) => o.op === 'delete');
        const changedFields: string[] = [];
        const nextRevision = Number(current._revision) + 1;

        if (isDelete) {
          await client.query(
            `UPDATE ${table} SET _deleted_at = now(), _revision = $2, _updated_at = now(), _updated_by = $3
             WHERE id = $1`,
            [recordId, nextRevision, changeSet.author_id],
          );
          changedFields.push('_deleted_at');
        } else {
          const sets: string[] = [];
          const params: unknown[] = [];
          let idx = 1;
          for (const op of groupOps) {
            if (op.field_name) {
              sets.push(`${quoteIdent(op.field_name)} = $${idx++}`);
              params.push(op.new_value);
              changedFields.push(op.field_name);
            }
            opIndex++;
            if (this.applyFaultInjection?.afterOpIndex === opIndex) {
              throw new Error('Fault injection: simulated apply failure');
            }
          }
          params.push(nextRevision, changeSet.author_id, recordId);
          await client.query(
            `UPDATE ${table}
             SET ${sets.join(', ')}, _revision = $${idx++}, _updated_at = now(), _updated_by = $${idx++}
             WHERE id = $${idx}`,
            params,
          );
        }

        const updated = await queryOne<Record<string, unknown>>(
          client,
          `SELECT ${readCols} FROM ${table} WHERE id = $1`,
          [recordId],
        );
        await writeRevision(
          client,
          schemaName,
          sample.table_name,
          recordId,
          nextRevision,
          updated ?? {},
          changedFields,
          changeSet.author_id,
          changeSetId,
        );
      }

      await client.query(
        `UPDATE kitsune.change_sets SET status = 'applied', decided_at = now(), decided_by = $1 WHERE id = $2`,
        [reviewerId, changeSetId],
      );
      await writeAuditInTxn(client, {
        workspaceId,
        principalId: reviewerId,
        action: 'apply_change_set',
        outcome: 'allowed',
        detail: { changeSetId },
      });
      const reindexTargets = new Map<string, string>();
      for (const op of approvedOps) {
        if (op.record_id && op.collection_name) {
          reindexTargets.set(
            `${op.collection_name}:${op.record_id}`,
            op.collection_name,
          );
        }
      }
      await client.query('COMMIT');
      for (const [key, collectionName] of reindexTargets) {
        const recordId = key.slice(collectionName.length + 1);
        try {
          await this.maybeReindexAfterWrite(
            workspaceId,
            collectionName,
            recordId,
          );
        } catch (reindexError) {
          console.error(
            'Embedding reindex failed after applyChangeSet',
            reindexError,
          );
        }
      }
      return { status: 'applied' };
    } catch (error) {
      await client.query('ROLLBACK');
      if (
        error instanceof Error &&
        error.message.startsWith('Fault injection')
      ) {
        throw error;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async readChangeSetFeedback(
    workspaceId: string,
    principalId: string,
    changeSetId: string,
  ) {
    const client = await this.appPool.connect();
    try {
      const changeSet = await queryOne<{ author_id: string }>(
        client,
        `SELECT author_id FROM kitsune.change_sets WHERE id = $1 AND workspace_id = $2`,
        [changeSetId, workspaceId],
      );
      if (!changeSet || changeSet.author_id !== principalId) {
        throw new KitsuneError('Not found', 'not_found');
      }
      const ops = await queryRows<{
        id: string;
        field_name: string | null;
        status: string;
        review_comment: string | null;
      }>(
        client,
        `SELECT id, field_name, status, review_comment FROM kitsune.change_ops
         WHERE change_set_id = $1 ORDER BY seq`,
        [changeSetId],
      );
      return {
        changeSetId,
        operations: ops.map((o) => ({
          opId: o.id,
          fieldName: o.field_name,
          status: o.status,
          comment: o.review_comment,
        })),
      };
    } finally {
      client.release();
    }
  }

  async directWrite(
    workspaceId: string,
    principalId: string,
    collection: string,
    record: Record<string, JsonValue>,
    options?: { recordId?: string },
  ): Promise<string> {
    await assertWriteEntitlement(this.ownerPool, workspaceId);
    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId });
      const meta = await getCollectionMeta(client, workspaceId, collection);
      const grant = await loadResolvedGrant(client, principalId, meta.id);
      if (
        !grant ||
        CAPABILITY_ORDER.indexOf(grant.capability) <
          CAPABILITY_ORDER.indexOf('write')
      ) {
        throw new KitsuneError('Not found', 'not_found');
      }
      for (const field of Object.keys(record)) {
        assertFieldAllowed(grant, field, 'write');
      }
      const recordId = options?.recordId ?? uuidv4();
      const table = `${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)}`;
      const row = {
        id: recordId,
        ...record,
        _revision: 1,
        _updated_by: principalId,
      };
      const cols = Object.keys(row);
      await client.query(
        `INSERT INTO ${table} (${cols.map((c) => quoteIdent(c)).join(', ')})
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
        cols.map((c) => row[c as keyof typeof row]),
      );
      await writeRevision(
        client,
        schemaName,
        meta.tableName,
        recordId,
        1,
        row,
        Object.keys(record),
        principalId,
        null,
      );
      await writeAuditInTxn(client, {
        workspaceId,
        principalId,
        action: 'write',
        collectionId: meta.id,
        recordIds: [recordId],
        fieldNames: Object.keys(record),
        outcome: 'allowed',
      });
      await client.query('COMMIT');
      const recordIdOut = recordId;
      client.release();
      try {
        await this.maybeReindexAfterWrite(workspaceId, collection, recordIdOut);
      } catch (reindexError) {
        console.error(
          'Embedding reindex failed after directWrite',
          reindexError,
        );
      }
      return recordIdOut;
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      throw error;
    }
  }

  async expireChangeSet(changeSetId: string): Promise<void> {
    await this.ownerPool.query(
      `UPDATE kitsune.change_sets SET status = 'expired', expires_at = now() - interval '1 day' WHERE id = $1`,
      [changeSetId],
    );
  }

  async previewSchemaChange(
    workspaceId: string,
    actorId: string,
    input: SchemaChangeInput,
  ): Promise<{
    incompatibleChangeSetIds: string[];
    reasons: Record<string, string>;
  }> {
    await this.requireCollectionAdmin(workspaceId, actorId, input.collection);
    return this.findIncompatibleChangeSets(workspaceId, input);
  }

  async applySchemaChange(
    workspaceId: string,
    actorId: string,
    input: SchemaChangeInput & { confirmStaleIds: string[] },
  ): Promise<{ schemaVersion: number; staleChangeSetIds: string[] }> {
    await assertWriteEntitlement(this.ownerPool, workspaceId);
    await this.requireCollectionAdmin(workspaceId, actorId, input.collection);
    const preview = await this.findIncompatibleChangeSets(workspaceId, input);
    const expected = [...preview.incompatibleChangeSetIds].sort();
    const confirmed = [...input.confirmStaleIds].sort();
    if (expected.join(',') !== confirmed.join(',')) {
      throw new KitsuneError(
        'confirmStaleIds does not match incompatible change sets',
        'validation',
        { incompatibleChangeSetIds: preview.incompatibleChangeSetIds },
      );
    }

    const schemaName = schemaNameForWorkspace(workspaceId);
    const { ddlUp, ddlDown, payload, fieldRow } =
      await this.buildSchemaChangeDdl(workspaceId, schemaName, input);

    const schemaVersion = await withOwner(this.ownerPool, async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL lock_timeout = '5000ms'`);
        const meta = await getCollectionMeta(
          client,
          workspaceId,
          input.collection,
        );
        await client.query(
          `LOCK TABLE ${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)} IN ACCESS EXCLUSIVE MODE`,
        );

        for (const id of expected) {
          await client.query(
            `UPDATE kitsune.change_sets
                SET status = 'stale'
              WHERE id = $1 AND workspace_id = $2`,
            [id, workspaceId],
          );
        }

        for (const stmt of ddlUp) {
          await client.query(stmt);
        }

        if (input.op === 'addField' && input.field) {
          await client.query(
            `INSERT INTO kitsune.fields
              (id, collection_id, name, type, nullable, relation_target, relation_kind, enum_values, indexed)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              uuidv4(),
              meta.id,
              input.field.name,
              input.field.type,
              input.field.nullable ?? true,
              fieldRow?.relationTargetId ?? null,
              input.field.type === 'relation' ? 'many_to_one' : null,
              input.field.enumValues ?? null,
              input.field.indexed ?? false,
            ],
          );
        } else if (input.op === 'dropField' && input.fieldName) {
          await client.query(
            `DELETE FROM kitsune.fields WHERE collection_id = $1 AND name = $2`,
            [meta.id, input.fieldName],
          );
        } else if (input.op === 'setIndexed' && input.fieldName) {
          await client.query(
            `UPDATE kitsune.fields SET indexed = $1 WHERE collection_id = $2 AND name = $3`,
            [input.indexed === true, meta.id, input.fieldName],
          );
        }

        const versioned = await queryOne<{ schema_version: number }>(
          client,
          `UPDATE kitsune.collections
              SET schema_version = schema_version + 1
            WHERE id = $1
            RETURNING schema_version`,
          [meta.id],
        );
        const nextVersion = versioned?.schema_version ?? 1;
        await client.query(
          `INSERT INTO kitsune.schema_revisions
            (id, collection_id, version, op, payload, ddl_up, ddl_down)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            uuidv4(),
            meta.id,
            nextVersion,
            input.op,
            JSON.stringify(payload),
            ddlUp.join('\n'),
            ddlDown.join('\n'),
          ],
        );
        await client.query('COMMIT');
        return nextVersion;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });

    await writeAudit(this.appPool, {
      workspaceId,
      principalId: actorId,
      action: 'schema.change',
      outcome: 'allowed',
      detail: {
        collection: input.collection,
        op: input.op,
        schemaVersion,
      },
    });

    return {
      schemaVersion,
      staleChangeSetIds: expected,
    };
  }

  async revertSchemaChange(
    workspaceId: string,
    actorId: string,
    collection: string,
    toVersion: number,
  ): Promise<{ schemaVersion: number }> {
    await assertWriteEntitlement(this.ownerPool, workspaceId);
    await this.requireCollectionAdmin(workspaceId, actorId, collection);
    if (!Number.isSafeInteger(toVersion) || toVersion < 1) {
      throw new KitsuneError('Invalid target schema version', 'validation');
    }

    const schemaName = schemaNameForWorkspace(workspaceId);
    const schemaVersion = await withOwner(this.ownerPool, async (client) => {
      await client.query('BEGIN');
      try {
        const meta = await getCollectionMeta(client, workspaceId, collection);
        const current = await queryOne<{ schema_version: number }>(
          client,
          `SELECT schema_version FROM kitsune.collections WHERE id = $1`,
          [meta.id],
        );
        const currentVersion = current?.schema_version ?? 1;
        if (toVersion >= currentVersion) {
          throw new KitsuneError(
            'Target version must be lower than current',
            'validation',
          );
        }

        const revisions = await queryRows<{
          version: number;
          op: string;
          payload: SchemaChangeInput & { field?: { name: string } };
          ddl_down: string;
        }>(
          client,
          `SELECT version, op, payload, ddl_down
             FROM kitsune.schema_revisions
            WHERE collection_id = $1 AND version > $2 AND reverted_at IS NULL
            ORDER BY version DESC`,
          [meta.id, toVersion],
        );

        await client.query(`SET LOCAL lock_timeout = '5000ms'`);
        await client.query(
          `LOCK TABLE ${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)} IN ACCESS EXCLUSIVE MODE`,
        );

        for (const rev of revisions) {
          const payload = rev.payload;
          const fieldName =
            payload.fieldName ?? payload.field?.name ?? undefined;
          if (rev.op === 'addField' && fieldName) {
            const stale = await this.findOpsForField(
              client,
              workspaceId,
              meta.id,
              fieldName,
            );
            for (const id of stale) {
              await client.query(
                `UPDATE kitsune.change_sets SET status = 'stale' WHERE id = $1`,
                [id],
              );
            }
          }
          for (const stmt of rev.ddl_down.split('\n').filter(Boolean)) {
            await client.query(stmt);
          }
          if (rev.op === 'addField' && fieldName) {
            await client.query(
              `DELETE FROM kitsune.fields WHERE collection_id = $1 AND name = $2`,
              [meta.id, fieldName],
            );
          } else if (rev.op === 'dropField' && fieldName && payload.field) {
            const field = payload.field;
            await client.query(
              `INSERT INTO kitsune.fields
                (id, collection_id, name, type, nullable, relation_target, relation_kind, enum_values, indexed)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                uuidv4(),
                meta.id,
                field.name,
                field.type,
                field.nullable ?? true,
                null,
                field.type === 'relation' ? 'many_to_one' : null,
                field.enumValues ?? null,
                field.indexed ?? false,
              ],
            );
          } else if (rev.op === 'setIndexed' && fieldName) {
            await client.query(
              `UPDATE kitsune.fields SET indexed = $1 WHERE collection_id = $2 AND name = $3`,
              [payload.indexed === false, meta.id, fieldName],
            );
          }
          await client.query(
            `UPDATE kitsune.schema_revisions SET reverted_at = now() WHERE collection_id = $1 AND version = $2`,
            [meta.id, rev.version],
          );
        }

        await client.query(
          `UPDATE kitsune.collections SET schema_version = $1 WHERE id = $2`,
          [toVersion, meta.id],
        );
        await client.query('COMMIT');
        return toVersion;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });

    await writeAudit(this.appPool, {
      workspaceId,
      principalId: actorId,
      action: 'schema.revert',
      outcome: 'allowed',
      detail: { collection, schemaVersion },
    });
    return { schemaVersion };
  }

  async readRecordAt(
    workspaceId: string,
    principalId: string,
    collection: string,
    recordId: string,
    sel: { revision?: number; at?: string },
  ): Promise<Record<string, JsonValue> | null> {
    if (sel.revision === undefined && !sel.at) {
      throw new KitsuneError('revision or at is required', 'validation');
    }
    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, {
        schemaName,
        principalId,
        includeDeleted: true,
      });
      const meta = await getCollectionMeta(client, workspaceId, collection);
      const grant = await loadResolvedGrant(client, principalId, meta.id);
      if (!grant || grant.capability === 'none') {
        throw new KitsuneError('Not found', 'not_found');
      }
      await assertRowAccessible(
        client,
        workspaceId,
        principalId,
        schemaName,
        meta,
        grant,
        recordId,
        { includeDeleted: true },
      );
      const snapshot =
        sel.revision !== undefined
          ? await getRevisionSnapshot(
              client,
              schemaName,
              meta.tableName,
              recordId,
              sel.revision,
            )
          : ((
              await getRevisionAtTime(
                client,
                schemaName,
                meta.tableName,
                recordId,
                sel.at as string,
              )
            )?.snapshot ?? null);
      await client.query('COMMIT');
      if (!snapshot) {
        return null;
      }
      const allowed =
        grant.fieldMask === null
          ? meta.fields
          : grant.fieldMask.filter((f) => meta.fields.includes(f));
      const row: Record<string, JsonValue> = {
        id: recordId,
      };
      for (const field of allowed) {
        row[field] = (snapshot[field] as JsonValue) ?? null;
      }
      return row;
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof KitsuneError && error.code === 'not_found') {
        return null;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listRecordRevisions(
    workspaceId: string,
    principalId: string,
    collection: string,
    recordId: string,
    opts: { limit: number; beforeRevision?: number },
  ): Promise<{ revisions: RevisionSummary[]; hasMore: boolean }> {
    const limit = Math.min(Math.max(opts.limit, 1), 100);
    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, {
        schemaName,
        principalId,
        includeDeleted: true,
      });
      const meta = await getCollectionMeta(client, workspaceId, collection);
      const grant = await loadResolvedGrant(client, principalId, meta.id);
      if (!grant || grant.capability === 'none') {
        throw new KitsuneError('Not found', 'not_found');
      }
      await assertRowAccessible(
        client,
        workspaceId,
        principalId,
        schemaName,
        meta,
        grant,
        recordId,
        { includeDeleted: true },
      );
      const revTable = `${quoteIdent(schemaName)}.${quoteIdent(`${meta.tableName}__rev`)}`;
      const params: unknown[] = [recordId];
      let where = 'record_id = $1';
      if (opts.beforeRevision !== undefined) {
        params.push(opts.beforeRevision);
        where += ` AND revision < $2`;
      }
      params.push(limit + 1);
      const rows = await queryRows<{
        revision: string;
        changed_fields: string[];
        principal_id: string;
        change_set_id: string | null;
        valid_from: Date;
      }>(
        client,
        `SELECT revision, changed_fields, principal_id, change_set_id, valid_from
           FROM ${revTable}
          WHERE ${where}
          ORDER BY revision DESC
          LIMIT $${params.length}`,
        params,
      );
      await client.query('COMMIT');
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      return {
        hasMore,
        revisions: page.map((r) => ({
          collection,
          recordId,
          revision: Number(r.revision),
          changedFields: r.changed_fields,
          principalId: r.principal_id,
          changeSetId: r.change_set_id,
          validFrom: r.valid_from.toISOString(),
        })),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Set per-collection revision retention. `null` keeps history forever.
   * Admin-only (same gate as audit).
   */
  async setRevisionRetentionDays(
    workspaceId: string,
    principalId: string,
    collection: string,
    days: number | null,
  ): Promise<void> {
    if (days !== null && (!Number.isInteger(days) || days < 1)) {
      throw new KitsuneError(
        'revision_retention_days must be a positive integer or null',
        'validation',
      );
    }
    await this.requireCollectionAdmin(workspaceId, principalId, collection);
    const updated = await this.ownerPool.query(
      `UPDATE kitsune.collections
          SET revision_retention_days = $1
        WHERE workspace_id = $2 AND name = $3`,
      [days, workspaceId, collection],
    );
    if ((updated.rowCount ?? 0) === 0) {
      throw new KitsuneError('Not found', 'not_found');
    }
    await writeAudit(this.ownerPool, {
      workspaceId,
      principalId,
      action: 'schema.revision_retention',
      fieldNames: [collection],
      outcome: 'allowed',
      reason:
        days === null ? 'retention=forever' : `retention_days=${days}`,
    });
  }

  /**
   * Delete expired `__rev` rows per collection retention. Admin-only.
   */
  async sweepRevisions(
    workspaceId: string,
    principalId: string,
  ): Promise<SweepRevisionsResult> {
    const admin = await this.hasAdminOnAnyCollection(workspaceId, principalId);
    if (!admin) {
      throw new KitsuneError('Not found', 'not_found');
    }
    const schemaName = schemaNameForWorkspace(workspaceId);
    const result = await withOwner(this.ownerPool, async (client) =>
      sweepExpiredRevisions(client, workspaceId, schemaName),
    );
    await writeAudit(this.ownerPool, {
      workspaceId,
      principalId,
      action: 'revisions.sweep',
      fieldNames: result.collections.map((c) => c.collection),
      outcome: 'allowed',
      reason: `deleted=${result.deleted}`,
    });
    return result;
  }

  async listRevisionsByPrincipal(
    workspaceId: string,
    callerId: string,
    opts: { authorId: string; from?: string; to?: string; limit: number },
  ): Promise<RevisionSummary[]> {
    const limit = Math.min(Math.max(opts.limit, 1), 200);
    if (opts.authorId !== callerId) {
      const admin = await this.hasAdminOnAnyCollection(workspaceId, callerId);
      if (!admin) {
        throw new KitsuneError('Not found', 'not_found');
      }
    }
    const schemaName = schemaNameForWorkspace(workspaceId);
    const collections = await this.ownerPool.query<{
      name: string;
      table_name: string;
    }>(
      `SELECT name, table_name FROM kitsune.collections WHERE workspace_id = $1`,
      [workspaceId],
    );
    const results: RevisionSummary[] = [];
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, {
        schemaName,
        principalId: callerId,
        includeDeleted: true,
      });
      for (const collection of collections.rows) {
        const revTable = `${quoteIdent(schemaName)}.${quoteIdent(`${collection.table_name}__rev`)}`;
        const params: unknown[] = [opts.authorId];
        const where = ['principal_id = $1'];
        if (opts.from) {
          params.push(opts.from);
          where.push(`valid_from >= $${params.length}::timestamptz`);
        }
        if (opts.to) {
          params.push(opts.to);
          where.push(`valid_from <= $${params.length}::timestamptz`);
        }
        params.push(limit);
        const rows = await queryRows<{
          record_id: string;
          revision: string;
          changed_fields: string[];
          change_set_id: string | null;
          valid_from: Date;
        }>(
          client,
          `SELECT record_id, revision, changed_fields, change_set_id, valid_from
             FROM ${revTable}
            WHERE ${where.join(' AND ')}
            ORDER BY valid_from DESC
            LIMIT $${params.length}`,
          params,
        );
        for (const row of rows) {
          results.push({
            collection: collection.name,
            recordId: row.record_id,
            revision: Number(row.revision),
            changedFields: row.changed_fields,
            principalId: opts.authorId,
            changeSetId: row.change_set_id,
            validFrom: row.valid_from.toISOString(),
          });
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    results.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
    return results.slice(0, limit);
  }

  async queryAudit(
    workspaceId: string,
    principalId: string,
    opts: AuditQuery,
  ): Promise<AuditRow[]> {
    const admin = await this.hasAdminOnAnyCollection(workspaceId, principalId);
    if (!admin) {
      throw new KitsuneError('Not found', 'not_found');
    }
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const params: unknown[] = [workspaceId];
    const where = ['workspace_id = $1'];
    if (opts.actorId) {
      params.push(opts.actorId);
      where.push(`principal_id = $${params.length}`);
    }
    if (opts.collectionId) {
      params.push(opts.collectionId);
      where.push(`collection_id = $${params.length}`);
    }
    if (opts.from) {
      params.push(opts.from);
      where.push(`at >= $${params.length}::timestamptz`);
    }
    if (opts.to) {
      params.push(opts.to);
      where.push(`at <= $${params.length}::timestamptz`);
    }
    if (opts.action) {
      params.push(opts.action);
      where.push(`action = $${params.length}`);
    }
    if (opts.outcome) {
      params.push(opts.outcome);
      where.push(`outcome = $${params.length}`);
    }
    params.push(limit);
    const rows = await this.appPool.query<{
      id: string;
      principal_id: string;
      action: string;
      collection_id: string | null;
      record_ids: string[] | null;
      field_names: string[] | null;
      outcome: 'allowed' | 'denied';
      reason: string | null;
      at: Date;
    }>(
      `SELECT id, principal_id, action, collection_id, record_ids, field_names, outcome, reason, at
         FROM kitsune.audit_log
        WHERE ${where.join(' AND ')}
        ORDER BY at DESC
        LIMIT $${params.length}`,
      params,
    );
    return rows.rows.map((r) => ({
      id: r.id,
      principalId: r.principal_id,
      action: r.action,
      collectionId: r.collection_id,
      recordIds: r.record_ids,
      fieldNames: r.field_names,
      outcome: r.outcome,
      reason: r.reason,
      at: r.at.toISOString(),
    }));
  }

  async listGrants(
    workspaceId: string,
    callerId: string,
  ): Promise<
    Array<{
      id: string;
      principalId: string;
      collection: string;
      capability: Capability;
      fieldMask: string[] | null;
      rowPredicate: Predicate | null;
      revokedAt: string | null;
    }>
  > {
    const admin = await this.hasAdminOnAnyCollection(workspaceId, callerId);
    const params: unknown[] = [workspaceId];
    let principalFilter = '';
    if (!admin) {
      params.push(callerId);
      principalFilter = `AND g.principal_id = $${params.length}`;
    }
    const rows = await this.ownerPool.query<{
      id: string;
      principal_id: string;
      collection: string;
      capability: Capability;
      field_mask: string[] | null;
      row_predicate: Predicate | null;
      revoked_at: Date | null;
    }>(
      `SELECT g.id, g.principal_id, c.name AS collection, g.capability,
              g.field_mask, g.row_predicate, g.revoked_at
         FROM kitsune.grants g
         JOIN kitsune.collections c ON c.id = g.collection_id
        WHERE g.workspace_id = $1 ${principalFilter}
        ORDER BY c.name, g.created_at`,
      params,
    );
    return rows.rows.map((r) => ({
      id: r.id,
      principalId: r.principal_id,
      collection: r.collection,
      capability: r.capability,
      fieldMask: r.field_mask,
      rowPredicate: r.row_predicate,
      revokedAt: r.revoked_at ? r.revoked_at.toISOString() : null,
    }));
  }

  private async hasAdminOnAnyCollection(
    workspaceId: string,
    principalId: string,
  ): Promise<boolean> {
    const row = await this.ownerPool.query(
      `SELECT 1 FROM kitsune.grants
        WHERE workspace_id = $1 AND principal_id = $2
          AND revoked_at IS NULL AND capability = 'admin'
        LIMIT 1`,
      [workspaceId, principalId],
    );
    return row.rows.length > 0;
  }

  private async requireCollectionAdmin(
    workspaceId: string,
    actorId: string,
    collection: string,
  ): Promise<void> {
    const meta = await this.ownerPool.query<{ id: string }>(
      `SELECT id FROM kitsune.collections WHERE workspace_id = $1 AND name = $2`,
      [workspaceId, collection],
    );
    const collectionId = meta.rows[0]?.id;
    if (!collectionId) {
      throw new KitsuneError('Not found', 'not_found');
    }
    const grant = await withOwner(this.ownerPool, async (client) =>
      loadResolvedGrant(client, actorId, collectionId),
    );
    if (
      !grant ||
      CAPABILITY_ORDER.indexOf(grant.capability) <
        CAPABILITY_ORDER.indexOf('admin')
    ) {
      throw new KitsuneError('Not found', 'not_found');
    }
  }

  private async findOpsForField(
    client: {
      query: (
        sql: string,
        params?: unknown[],
      ) => Promise<{ rows: Array<{ id: string }> }>;
    },
    workspaceId: string,
    collectionId: string,
    fieldName: string,
  ): Promise<string[]> {
    const result = await client.query(
      `SELECT DISTINCT cs.id
         FROM kitsune.change_sets cs
         JOIN kitsune.change_ops o ON o.change_set_id = cs.id
        WHERE cs.workspace_id = $1
          AND cs.status IN ('open','blocked')
          AND o.collection_id = $2
          AND o.field_name = $3`,
      [workspaceId, collectionId, fieldName],
    );
    return result.rows.map((r) => r.id);
  }

  private async findIncompatibleChangeSets(
    workspaceId: string,
    input: SchemaChangeInput,
  ): Promise<{
    incompatibleChangeSetIds: string[];
    reasons: Record<string, string>;
  }> {
    if (input.op !== 'dropField' || !input.fieldName) {
      return { incompatibleChangeSetIds: [], reasons: {} };
    }
    const meta = await this.ownerPool.query<{ id: string }>(
      `SELECT id FROM kitsune.collections WHERE workspace_id = $1 AND name = $2`,
      [workspaceId, input.collection],
    );
    const collectionId = meta.rows[0]?.id;
    if (!collectionId) {
      throw new KitsuneError('Not found', 'not_found');
    }
    const ids = await this.findOpsForField(
      this.ownerPool,
      workspaceId,
      collectionId,
      input.fieldName,
    );
    const reasons: Record<string, string> = {};
    for (const id of ids) {
      reasons[id] = `Open operation references field ${input.fieldName}`;
    }
    return { incompatibleChangeSetIds: ids, reasons };
  }

  private async buildSchemaChangeDdl(
    workspaceId: string,
    schemaName: string,
    input: SchemaChangeInput,
  ): Promise<{
    ddlUp: string[];
    ddlDown: string[];
    payload: Record<string, JsonValue>;
    fieldRow?: { relationTargetId: string | null };
  }> {
    const meta = await withOwner(this.ownerPool, async (client) =>
      getCollectionMeta(client, workspaceId, input.collection),
    );
    if (input.op === 'addField') {
      if (!input.field) {
        throw new KitsuneError('field is required for addField', 'validation');
      }
      validateFieldDefinition(input.field);
      if (meta.fields.includes(input.field.name)) {
        throw new KitsuneError(
          `Field already exists: ${input.field.name}`,
          'validation',
        );
      }
      let relationTarget: { schemaName: string; tableName: string } | undefined;
      let relationTargetId: string | null = null;
      if (input.field.type === 'relation' && input.field.relationTarget) {
        const target = await this.ownerPool.query<{
          id: string;
          table_name: string;
        }>(
          `SELECT id, table_name FROM kitsune.collections
            WHERE workspace_id = $1 AND name = $2`,
          [workspaceId, input.field.relationTarget],
        );
        if (!target.rows[0]) {
          throw new KitsuneError(
            `Relation target not found: ${input.field.relationTarget}`,
            'validation',
          );
        }
        relationTargetId = target.rows[0].id;
        relationTarget = {
          schemaName,
          tableName: target.rows[0].table_name,
        };
      }
      const ddlUp = generateAddFieldDdl(
        schemaName,
        meta.tableName,
        input.field,
        relationTarget,
      );
      const ddlDown = generateDropFieldDdl(
        schemaName,
        meta.tableName,
        input.field.name,
      );
      return {
        ddlUp,
        ddlDown,
        payload: {
          collection: input.collection,
          op: input.op,
          field: input.field as unknown as JsonValue,
        },
        fieldRow: { relationTargetId },
      };
    }
    if (input.op === 'dropField') {
      if (!input.fieldName) {
        throw new KitsuneError(
          'fieldName is required for dropField',
          'validation',
        );
      }
      const existing = await this.ownerPool.query<{
        name: string;
        type: string;
        nullable: boolean;
        enum_values: string[] | null;
        indexed: boolean;
      }>(
        `SELECT f.name, f.type, f.nullable, f.enum_values, f.indexed
           FROM kitsune.fields f
          WHERE f.collection_id = $1 AND f.name = $2`,
        [meta.id, input.fieldName],
      );
      const field = existing.rows[0];
      if (!field) {
        throw new KitsuneError(
          `Field not found: ${input.fieldName}`,
          'validation',
        );
      }
      const definition = {
        name: field.name,
        type: field.type as CollectionDefinition['fields'][0]['type'],
        nullable: field.nullable,
        enumValues: field.enum_values ?? undefined,
        indexed: field.indexed,
      };
      return {
        ddlUp: generateDropFieldDdl(
          schemaName,
          meta.tableName,
          input.fieldName,
        ),
        ddlDown: generateAddFieldDdl(schemaName, meta.tableName, definition),
        payload: {
          collection: input.collection,
          op: input.op,
          fieldName: input.fieldName,
          field: definition as unknown as JsonValue,
        },
      };
    }
    if (input.op === 'setIndexed') {
      if (!input.fieldName || input.indexed === undefined) {
        throw new KitsuneError(
          'fieldName and indexed are required for setIndexed',
          'validation',
        );
      }
      return {
        ddlUp: generateSetIndexedDdl(
          schemaName,
          meta.tableName,
          input.fieldName,
          input.indexed,
        ),
        ddlDown: generateSetIndexedDdl(
          schemaName,
          meta.tableName,
          input.fieldName,
          !input.indexed,
        ),
        payload: {
          collection: input.collection,
          op: input.op,
          fieldName: input.fieldName,
          indexed: input.indexed,
        },
      };
    }
    throw new KitsuneError(`Unsupported schema op: ${input.op}`, 'validation');
  }

  private async acquireApplyLocks(
    client: PoolClient,
    schemaName: string,
    principalId: string,
    targets: Array<{ table_name: string; record_id: string | null }>,
  ): Promise<void> {
    for (let attempt = 0; attempt <= APPLY_LOCK_RETRIES; attempt++) {
      try {
        for (const target of targets) {
          const table = `${quoteIdent(schemaName)}.${quoteIdent(target.table_name)}`;
          await client.query(
            `SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`,
            [target.record_id],
          );
        }
        return;
      } catch (error) {
        const isLockTimeout =
          typeof error === 'object' &&
          error !== null &&
          (error as { code?: string }).code === LOCK_NOT_AVAILABLE;
        if (!isLockTimeout || attempt === APPLY_LOCK_RETRIES) {
          if (isLockTimeout) {
            throw new KitsuneError(
              'Timed out waiting for a lock on a record in this change set',
              'blocked',
            );
          }
          throw error;
        }
        // Rolling back releases whatever this attempt did acquire, so the retry never
        // waits while holding a lock. It also discards SET LOCAL, so the session
        // context has to be re-established.
        await client.query('ROLLBACK');
        await client.query('BEGIN');
        await setSessionContext(client, {
          schemaName,
          principalId,
          includeDeleted: true,
        });
        // sql-safe: applyLockTimeoutLiteral returns a coerced non-negative integer
        await client.query(
          `SET LOCAL lock_timeout = '${applyLockTimeoutLiteral()}'`,
        );
      }
    }
  }

  private async markChangeSetStatus(
    _workspaceId: string,
    reviewerId: string,
    changeSetId: string,
    status: string,
  ): Promise<void> {
    await this.ownerPool.query(
      `UPDATE kitsune.change_sets SET status = $1, decided_at = now(), decided_by = $2 WHERE id = $3`,
      [status, reviewerId, changeSetId],
    );
  }

  private async persistBlockedChangeSet(
    changeSetId: string,
    conflicts: string[],
    ops: Array<{ id: string; field_name: string | null }>,
  ): Promise<void> {
    const distinctConflicts = [...new Set(conflicts)];
    await withOwner(this.ownerPool, async (client) => {
      await client.query(
        `UPDATE kitsune.change_sets
            SET status = 'blocked',
                conflict_count = conflict_count + $2,
                conflicted_fields = (
                  SELECT COALESCE(array_agg(DISTINCT f), '{}')
                    FROM unnest(conflicted_fields || $3::text[]) AS f
                )
          WHERE id = $1`,
        [changeSetId, distinctConflicts.length, distinctConflicts],
      );
      for (const op of ops) {
        if (op.field_name && conflicts.includes(op.field_name)) {
          await client.query(
            `UPDATE kitsune.change_ops SET status = 'conflicted' WHERE id = $1`,
            [op.id],
          );
        }
      }
    });
  }
}

interface NormalizedOp {
  collection: string;
  recordId?: string;
  op: 'insert' | 'update' | 'delete';
  fieldName?: string;
  newValue?: JsonValue;
}

function normalizeOperations(operations: ChangeOpInput[]): NormalizedOp[] {
  return operations.map((op) => ({
    collection: op.collection,
    recordId: op.recordId,
    op: op.op,
    fieldName: op.fieldName,
    newValue: op.newValue,
  }));
}

async function assertRowAccessible(
  client: PoolClient,
  _workspaceId: string,
  _principalId: string,
  schemaName: string,
  meta: { id: string; tableName: string; fields: string[] },
  grant: ResolvedGrant,
  recordId: string,
  options?: { includeDeleted?: boolean },
): Promise<void> {
  const table = `${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)}`;
  const whereParts = [`t.${quoteIdent('id')} = $1`];
  const params: unknown[] = [recordId];
  if (grant.rowPredicate) {
    const compiled = compilePredicate(grant.rowPredicate, 't', 2);
    whereParts.push(compiled.sql);
    params.push(...compiled.params);
  }
  if (!options?.includeDeleted) {
    whereParts.push('t._deleted_at IS NULL');
  }
  const sql = `SELECT id FROM ${table} t WHERE ${whereParts.join(' AND ')}`;
  const row = await queryOne(client, sql, params);
  if (!row) {
    throw new KitsuneError('Not found', 'not_found');
  }
}

function groupInsertOps(ops: ApplyOp[]): Map<string, ApplyOp[]> {
  const groups = new Map<string, ApplyOp[]>();
  for (const op of ops) {
    const key = `${op.collection_id}:${op.record_id ?? 'new'}`;
    const list = groups.get(key) ?? [];
    list.push(op);
    groups.set(key, list);
  }
  return groups;
}

function groupRecordOps(ops: ApplyOp[]): Map<string, ApplyOp[]> {
  const groups = new Map<string, ApplyOp[]>();
  for (const op of ops) {
    const key = `${op.collection_id}:${op.record_id}`;
    const list = groups.get(key) ?? [];
    list.push(op);
    groups.set(key, list);
  }
  return groups;
}

export { DEFAULT_CONFIG };
