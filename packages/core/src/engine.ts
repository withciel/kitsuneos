import type { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { writeAudit, writeAuditInTxn } from './audit/log.js';
import {
  compileQuery,
  compileReadRecord,
  getCollectionMeta,
  type CollectionMeta,
} from './compiler/query.js';
import { compilePredicate } from './compiler/predicate-sql.js';
import {
  generateCollectionDdl,
  generateWorkspaceSchemaDdl,
} from './ddl/generator.js';
import {
  assertFieldAllowed,
  loadResolvedGrant,
} from './grants/resolve.js';
import { getChangedFieldsSince, writeRevision } from './revisions/write.js';
import type {
  Capability,
  ChangeOpInput,
  CollectionDefinition,
  DbConfig,
  JsonValue,
  Predicate,
  ProposeChangeSetInput,
  QueryRequest,
  ReviewDecision,
  ResolvedGrant,
} from './types.js';
import {
  CAPABILITY_ORDER,
  KitsuneError,
  quoteIdent,
  schemaNameForWorkspace,
} from './types.js';
import { createPools, queryOne, queryRows, setSessionContext, withOwner } from './db/pool.js';

export interface ApplyFaultInjection {
  afterOpIndex?: number;
}

export interface EngineOptions {
  config?: DbConfig;
  applyFaultInjection?: ApplyFaultInjection | null;
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

export class KitsuneEngine {
  readonly ownerPool: Pool;
  readonly appPool: Pool;
  applyFaultInjection: ApplyFaultInjection | null = null;

  constructor(options: EngineOptions = {}) {
    const config = options.config ?? DEFAULT_CONFIG;
    const pools = createPools(config);
    this.ownerPool = pools.ownerPool;
    this.appPool = pools.appPool;
    this.applyFaultInjection = options.applyFaultInjection ?? null;
  }

  async close(): Promise<void> {
    await this.ownerPool.end();
    await this.appPool.end();
  }

  async createWorkspace(slug: string): Promise<{ workspaceId: string; schemaName: string }> {
    const workspaceId = uuidv4();
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
  ): Promise<string> {
    const id = uuidv4();
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
    const schemaName = schemaNameForWorkspace(workspaceId);
    const collectionId = uuidv4();
    const tableName = definition.name;

    await withOwner(this.ownerPool, async (client) => {
      const existingCollections = await queryRows<{ id: string; name: string; table_name: string }>(
        client,
        `SELECT id, name, table_name FROM kitsune.collections WHERE workspace_id = $1`,
        [workspaceId],
      );

      const relationTargets = new Map<string, { schemaName: string; tableName: string }>();
      for (const field of definition.fields) {
        if (field.type === 'relation' && field.relationTarget) {
          const target = existingCollections.find((c) => c.name === field.relationTarget);
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
          const target = existingCollections.find((c) => c.name === field.relationTarget);
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

      for (const stmt of generateCollectionDdl(schemaName, tableName, definition.fields, relationTargets)) {
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
        CAPABILITY_ORDER.indexOf(capability) >= CAPABILITY_ORDER.indexOf('write')
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
        CAPABILITY_ORDER.indexOf(capability) >= CAPABILITY_ORDER.indexOf('write') &&
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

  async revokeGrant(grantId: string, actorId: string, workspaceId: string): Promise<void> {
    await withOwner(this.ownerPool, async (client) => {
      await client.query(
        `UPDATE kitsune.grants SET revoked_at = now() WHERE id = $1`,
        [grantId],
      );
    });
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
        const grant = await loadResolvedGrant(client, principalId, collection.id);
        if (!grant || grant.capability === 'none') {
          continue;
        }
        const fields = await queryRows<{ name: string; type: string }>(
          client,
          `SELECT name, type FROM kitsune.fields WHERE collection_id = $1 ORDER BY name`,
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

    const targetMeta = await getCollectionMeta(client, workspaceId, field.relationTarget);
    const targetGrant = await loadResolvedGrant(client, authorId, targetMeta.id);
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
    const schemaName = schemaNameForWorkspace(workspaceId);
    const changeSetId = uuidv4();
    const operationIds: string[] = [];

    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId: authorId, includeDeleted: true });

      const normalizedOps = normalizeOperations(input.operations);

      // Records created by this same change set are legitimate relation targets even
      // though they do not exist yet, so collect them before validating relations.
      const pendingRecordIds = new Set(
        normalizedOps
          .filter((op) => op.op === 'insert' && op.recordId)
          .map((op) => `${op.collection}:${op.recordId}`),
      );

      for (const op of normalizedOps) {
        const meta = await getCollectionMeta(client, workspaceId, op.collection);
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
        [changeSetId, workspaceId, authorId, input.title ?? null, input.rationale ?? null],
      );

      let seq = 0;
      for (const op of normalizedOps) {
        const meta = await getCollectionMeta(client, workspaceId, op.collection);
        const opId = uuidv4();
        operationIds.push(opId);

        let baseRevision: number | null = null;
        if (op.op !== 'insert' && op.recordId) {
          const table = `${quoteIdent(schemaName)}.${quoteIdent(meta.tableName)}`;
          const current = await queryOne<{ _revision: number; _deleted_at: string | null }>(
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
          [decision.status, decision.comment ?? null, decision.opId, changeSetId],
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
      if (changeSet.status === 'expired' || new Date(changeSet.expires_at) < new Date()) {
        await metaClient.query(
          `UPDATE kitsune.change_sets SET status = 'expired' WHERE id = $1`,
          [changeSetId],
        );
        throw new KitsuneError('Change set expired', 'expired');
      }
      if (changeSet.status !== 'open' && changeSet.status !== 'blocked') {
        throw new KitsuneError(`Change set status is ${changeSet.status}`, 'blocked');
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
        throw new KitsuneError('All operations must be approved or rejected before apply', 'validation');
      }
    } finally {
      metaClient.release();
    }

    const approvedOps = ops.filter((o) => o.status === 'approved');
    if (approvedOps.length === 0) {
      await this.markChangeSetStatus(workspaceId, reviewerId, changeSetId, 'rejected');
      return { status: 'rejected' };
    }

    const client = await this.appPool.connect();
    const conflicts: string[] = [];
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId: reviewerId, includeDeleted: true });

      const lockTargets = [
        ...new Map(
          approvedOps
            .filter((o) => o.record_id)
            .map((o) => [`${o.collection_id}:${o.record_id}`, o]),
        ).values(),
      ].sort((a, b) => {
        const ca = a.collection_id.localeCompare(b.collection_id);
        return ca !== 0 ? ca : (a.record_id ?? '').localeCompare(b.record_id ?? '');
      });

      for (const target of lockTargets) {
        const table = `${quoteIdent(schemaName)}.${quoteIdent(target.table_name)}`;
        await client.query(
          `SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`,
          [target.record_id],
        );
      }

      for (const op of approvedOps) {
        const grant = await loadResolvedGrant(client, changeSet.author_id, op.collection_id);
        if (!grant) {
          await client.query('ROLLBACK');
          await this.markChangeSetStatus(workspaceId, reviewerId, changeSetId, 'blocked');
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
            await this.markChangeSetStatus(workspaceId, reviewerId, changeSetId, 'blocked');
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
        const current = await queryOne<{ _revision: number; _deleted_at: string | null }>(
          client,
          `SELECT _revision, _deleted_at FROM ${table} WHERE id = $1`,
          [op.record_id],
        );
        if (!current || current._deleted_at) {
          await client.query('ROLLBACK');
          await this.markChangeSetStatus(workspaceId, reviewerId, changeSetId, 'blocked');
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

      const insertGroups = groupInsertOps(approvedOps.filter((o) => o.op === 'insert'));
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
        const meta = await getCollectionMeta(client, workspaceId, sample.collection_name);
        const readCols = ['id', '_revision', '_updated_at', '_updated_by', '_deleted_at', ...meta.fields]
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
      await client.query('COMMIT');
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
  ): Promise<string> {
    const schemaName = schemaNameForWorkspace(workspaceId);
    const client = await this.appPool.connect();
    try {
      await client.query('BEGIN');
      await setSessionContext(client, { schemaName, principalId });
      const meta = await getCollectionMeta(client, workspaceId, collection);
      const grant = await loadResolvedGrant(client, principalId, meta.id);
      if (!grant || CAPABILITY_ORDER.indexOf(grant.capability) < CAPABILITY_ORDER.indexOf('write')) {
        throw new KitsuneError('Not found', 'not_found');
      }
      for (const field of Object.keys(record)) {
        assertFieldAllowed(grant, field, 'write');
      }
      const recordId = uuidv4();
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
      return recordId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async expireChangeSet(changeSetId: string): Promise<void> {
    await this.ownerPool.query(
      `UPDATE kitsune.change_sets SET status = 'expired', expires_at = now() - interval '1 day' WHERE id = $1`,
      [changeSetId],
    );
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
    await withOwner(this.ownerPool, async (client) => {
      await client.query(
        `UPDATE kitsune.change_sets SET status = 'blocked' WHERE id = $1`,
        [changeSetId],
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

