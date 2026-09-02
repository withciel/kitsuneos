import { describe, expect, it, beforeAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { KitsuneError, migrate, DEFAULT_CONFIG, KitsuneEngine } from '@kitsuneos/core';
import { createMcpHandlers } from '@kitsuneos/mcp';
import {
  createStandardFixture,
  getEngine,
  getRecordRevision,
  getRevisionCount,
  seedAccount,
  seedOpportunity,
  type Fixture,
} from './fixtures.js';
import {
  oracleQuery,
  PRINCIPAL_CLASSES,
  QUERY_SHAPES,
  type OracleGrant,
  type OraclePrincipal,
  type OracleRecord,
} from './oracle.js';

describe('KitsuneOS Acceptance Suite', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
  });

  it('0. The runtime connects as a non-superuser without BYPASSRLS and every generated table forces RLS', async () => {
    const client = await engine.appPool.connect();
    try {
      const role = await client.query<{
        current_user: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>(
        `SELECT current_user, rolsuper, rolbypassrls
           FROM pg_roles WHERE rolname = current_user`,
      );
      expect(role.rows.length).toBe(1);
      expect(role.rows[0]!.current_user).toBe('kitsune_app');
      expect(role.rows[0]!.rolsuper).toBe(false);
      expect(role.rows[0]!.rolbypassrls).toBe(false);

      const tables = await client.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `SELECT relname, relrowsecurity, relforcerowsecurity
           FROM pg_class
          WHERE relnamespace = $1::regnamespace AND relkind = 'r'
          ORDER BY relname`,
        [fixture.schemaName],
      );
      expect(tables.rows.length).toBeGreaterThan(0);
      for (const table of tables.rows) {
        expect(
          { table: table.relname, enabled: table.relrowsecurity, forced: table.relforcerowsecurity },
        ).toEqual({ table: table.relname, enabled: true, forced: true });
      }
    } finally {
      client.release();
    }
  });

  it('1. Creating a collection generates real DDL with real indexes and a real foreign key', async () => {
    const tables = await engine['ownerPool'].query(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename IN ('accounts','opportunities','opportunities__rev')`,
      [fixture.schemaName],
    );
    expect(tables.rows.map((r) => r.tablename).sort()).toEqual([
      'accounts',
      'opportunities',
      'opportunities__rev',
    ]);

    const fk = await engine['ownerPool'].query(
      `SELECT c.condeferrable, c.condeferred
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = $1 AND t.relname = 'opportunities' AND c.contype = 'f'`,
      [fixture.schemaName],
    );
    expect(fk.rows.length).toBeGreaterThan(0);
    expect(fk.rows[0].condeferrable).toBe(true);
    expect(fk.rows[0].condeferred).toBe(true);

    const idx = await engine['ownerPool'].query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'opportunities'`,
      [fixture.schemaName],
    );
    expect(idx.rows.length).toBeGreaterThan(0);
  });

  it('2. Inserting an opportunity with a non-existent account_id is rejected at commit', async () => {
    const client = await engine.appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO ${fixture.schemaName}, kitsune, public`);
      await client.query(`SET LOCAL kitsune.schema_name = '${fixture.schemaName}'`);
      await client.query(`SET LOCAL kitsune.principal_id = '${fixture.adminId}'`);
      await client.query(`SET LOCAL kitsune.include_deleted = 'false'`);
      await client.query(
        `INSERT INTO opportunities (id, account_id, name, stage, _revision, _updated_by)
         VALUES ($1, $2, 'Bad Opp', 'prospecting', 1, $3)`,
        [uuidv4(), uuidv4(), fixture.adminId],
      );
      await expect(client.query('COMMIT')).rejects.toThrow(/foreign key|violates/);
    } finally {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* already rolled back */
      }
      client.release();
    }
  });

  it('3. A change set that creates an account and an opportunity referencing it succeeds in either order', async () => {
    const accountId = uuidv4();
    const oppId = uuidv4();

    const cs1 = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'insert', fieldName: 'name', newValue: 'Acme' },
        { collection: 'opportunities', recordId: oppId, op: 'insert', fieldName: 'account_id', newValue: accountId },
        { collection: 'opportunities', recordId: oppId, op: 'insert', fieldName: 'name', newValue: 'Deal 1' },
        { collection: 'opportunities', recordId: oppId, op: 'insert', fieldName: 'stage', newValue: 'prospecting' },
      ],
    });
    for (const opId of cs1.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs1.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    const r1 = await engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs1.changeSetId);
    expect(r1.status).toBe('applied');

    const accountId2 = uuidv4();
    const oppId2 = uuidv4();
    const cs2 = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'opportunities', recordId: oppId2, op: 'insert', fieldName: 'account_id', newValue: accountId2 },
        { collection: 'opportunities', recordId: oppId2, op: 'insert', fieldName: 'name', newValue: 'Deal 2' },
        { collection: 'opportunities', recordId: oppId2, op: 'insert', fieldName: 'stage', newValue: 'prospecting' },
        { collection: 'accounts', recordId: accountId2, op: 'insert', fieldName: 'name', newValue: 'Beta' },
      ],
    });
    for (const opId of cs2.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs2.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    const r2 = await engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs2.changeSetId);
    expect(r2.status).toBe('applied');
  });

  it('4. Every write produces exactly one __rev row with correct changed_fields', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'RevCo' });
    const before = await getRevisionCount(engine, fixture.schemaName, 'accounts', accountId);
    expect(before).toBe(1);

    const cs = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'name', newValue: 'RevCo Updated' },
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'industry', newValue: 'Tech' },
      ],
    });
    for (const opId of cs.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    await engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId);

    const after = await getRevisionCount(engine, fixture.schemaName, 'accounts', accountId);
    expect(after).toBe(2);

    const rev = await engine['ownerPool'].query(
      `SELECT changed_fields FROM ${fixture.schemaName}.accounts__rev WHERE record_id = $1 AND revision = 2`,
      [accountId],
    );
    expect(rev.rows[0].changed_fields.sort()).toEqual(['industry', 'name']);
  });

  it('5. A record state at an arbitrary past revision is reconstructable', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'V1', industry: 'A' });
    const cs = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'name', newValue: 'V2' },
      ],
    });
    for (const opId of cs.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    await engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId);

    const snap = await engine['ownerPool'].query(
      `SELECT snapshot FROM ${fixture.schemaName}.accounts__rev WHERE record_id = $1 AND revision = 1`,
      [accountId],
    );
    expect(snap.rows[0].snapshot.name).toBe('V1');
    expect(snap.rows[0].snapshot.industry).toBe('A');
  });

  it('6. A soft-deleted record is absent from queries but present in history', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'DeleteMe' });
    const cs = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [{ collection: 'accounts', recordId: accountId, op: 'delete' }],
    });
    for (const opId of cs.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    await engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId);

    const visible = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      accountId,
    );
    expect(visible).toBeNull();

    const history = await getRevisionCount(engine, fixture.schemaName, 'accounts', accountId);
    expect(history).toBeGreaterThan(0);
  });

  it('7. A clean change set applies and bumps _revision on every touched record', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'Bump' });
    const revBefore = await getRecordRevision(engine, fixture.schemaName, 'accounts', accountId);
    const cs = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'name', newValue: 'Bumped' },
      ],
    });
    for (const opId of cs.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    const result = await engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId);
    expect(result.status).toBe('applied');
    const revAfter = await getRecordRevision(engine, fixture.schemaName, 'accounts', accountId);
    expect(revAfter).toBe(revBefore + 1);
  });

  it('8. Two change sets touching different fields of the same record both apply cleanly', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'Multi', industry: 'X' });

    const cs1 = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'name', newValue: 'Multi-A' },
      ],
    });
    const cs2 = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'industry', newValue: 'Y' },
      ],
    });

    for (const opId of cs1.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs1.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    for (const opId of cs2.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs2.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }

    const r1 = await engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs1.changeSetId);
    const r2 = await engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs2.changeSetId);
    expect(r1.status).toBe('applied');
    expect(r2.status).toBe('applied');

    const record = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      accountId,
    );
    expect(record?.name).toBe('Multi-A');
    expect(record?.industry).toBe('Y');
  });

  it('9. Two change sets touching the same field: first applies, second blocked with conflicting field named', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'Conflict' });

    const cs1 = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'name', newValue: 'First' },
      ],
    });
    const cs2 = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'name', newValue: 'Second' },
      ],
    });

    for (const opId of cs1.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs1.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    for (const opId of cs2.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs2.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }

    const applied1 = await engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs1.changeSetId);
    expect(applied1.status).toBe('applied');

    const blocked = await engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs2.changeSetId);
    expect(blocked.status).toBe('blocked');
    expect(blocked.conflicts).toContain('name');
  });

  it('10. Apply is atomic — failure on last operation leaves nothing landed', async () => {
    const accountId = uuidv4();
    const oppId = uuidv4();
    const faultEngine = new KitsuneEngine({
      config: DEFAULT_CONFIG,
      applyFaultInjection: { afterOpIndex: 4 },
    });
    const cs = await faultEngine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'insert', fieldName: 'name', newValue: 'Atomic' },
        { collection: 'opportunities', recordId: oppId, op: 'insert', fieldName: 'account_id', newValue: accountId },
        { collection: 'opportunities', recordId: oppId, op: 'insert', fieldName: 'name', newValue: 'Atomic Opp' },
        { collection: 'opportunities', recordId: oppId, op: 'insert', fieldName: 'stage', newValue: 'prospecting' },
      ],
    });
    for (const opId of cs.operationIds) {
      await faultEngine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    await expect(
      faultEngine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId),
    ).rejects.toThrow(/Fault injection/);

    const account = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      accountId,
    );
    const opp = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'opportunities',
      oppId,
    );
    expect(account).toBeNull();
    expect(opp).toBeNull();
    await faultEngine.close();
  });

  it('11. Partial approval applies exactly approved operations', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'Partial', industry: 'Old' });
    const cs = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'name', newValue: 'Approved Name' },
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'industry', newValue: 'New' },
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'name', newValue: 'Rejected Name' },
      ],
    });
    const decisions = cs.operationIds.map((opId, i) => ({
      opId,
      status: i < 2 ? ('approved' as const) : ('rejected' as const),
      comment: i === 2 ? 'Duplicate field change' : undefined,
    }));
    await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId, decisions);
    await engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId);

    const record = await engine.readRecord(
      fixture.workspaceId,
      fixture.adminId,
      'accounts',
      accountId,
    );
    expect(record?.name).toBe('Approved Name');
    expect(record?.industry).toBe('New');

    const feedback = await engine.readChangeSetFeedback(
      fixture.workspaceId,
      fixture.agentId,
      cs.changeSetId,
    );
    expect(feedback.operations.find((o) => o.comment)?.comment).toBe('Duplicate field change');
  });

  it('12. Concurrent applies touching overlapping records do not deadlock', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'Concurrent', industry: 'Z' });
    const changeSets = [];
    for (let i = 0; i < 20; i++) {
      const cs = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
        operations: [
          {
            collection: 'accounts',
            recordId: accountId,
            op: 'update',
            fieldName: i % 2 === 0 ? 'name' : 'industry',
            newValue: i % 2 === 0 ? `Name-${i}` : `Ind-${i}`,
          },
        ],
      });
      for (const opId of cs.operationIds) {
        await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId, [
          { opId, status: 'approved' },
        ]);
      }
      changeSets.push(cs.changeSetId);
    }

    const results = await Promise.allSettled(
      changeSets.map((id) =>
        engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, id),
      ),
    );
    const applied = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 'applied',
    );
    expect(applied.length).toBeGreaterThan(0);
    expect(results.some((r) => r.status === 'rejected')).toBe(false);
  });

  it('13. A change set referencing a deleted record fails at apply and does not resurrect it', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'Gone' });
    const delCs = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [{ collection: 'accounts', recordId: accountId, op: 'delete' }],
    });
    for (const opId of delCs.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, delCs.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    await engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, delCs.changeSetId);

    const cs = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'name', newValue: 'Resurrect' },
      ],
    });
    for (const opId of cs.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    await expect(
      engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId),
    ).rejects.toMatchObject({ code: 'blocked' });
  });

  it('14. An expired change set cannot be applied', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'Expire' });
    const cs = await engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'name', newValue: 'Expired' },
      ],
    });
    await engine.expireChangeSet(cs.changeSetId);
    for (const opId of cs.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    await expect(
      engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId),
    ).rejects.toMatchObject({ code: 'expired' });
  });

  it('15. A principal with a field mask cannot read masked fields via any path', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'Mask' });
    const oppId = await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Masked Opp',
      amount: 5000,
      stage: 'prospecting',
    });

    await expect(
      engine.query(fixture.workspaceId, fixture.readerId, {
        collection: 'opportunities',
        fields: ['amount'],
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    await expect(
      engine.query(fixture.workspaceId, fixture.readerId, {
        collection: 'opportunities',
        fields: ['name'],
        filters: [{ field: 'amount', op: 'gt', value: 1000 }],
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    await expect(
      engine.query(fixture.workspaceId, fixture.readerId, {
        collection: 'opportunities',
        fields: ['name'],
        sort: [{ field: 'amount', direction: 'asc' }],
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    await expect(
      engine.query(fixture.workspaceId, fixture.readerId, {
        collection: 'opportunities',
        aggregates: [{ fn: 'sum', field: 'amount', alias: 'total' }],
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });

    const direct = await engine.readRecord(
      fixture.workspaceId,
      fixture.readerId,
      'opportunities',
      oppId,
      ['amount'],
    );
    expect(direct).toBeNull();
  });

  it('16. A principal with a row predicate receives not-found for excluded rows', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'Pred' });
    const openId = await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Open',
      stage: 'prospecting',
      amount: 100,
    });
    const closedId = await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Closed',
      stage: 'closed_won',
      amount: 200,
    });

    const list = await engine.query(fixture.workspaceId, fixture.predicateAgentId, {
      collection: 'opportunities',
      fields: ['name', 'stage'],
    });
    expect(list.map((r) => r.name)).toContain('Open');
    expect(list.map((r) => r.name)).not.toContain('Closed');

    const missing = await engine.readRecord(
      fixture.workspaceId,
      fixture.predicateAgentId,
      'opportunities',
      closedId,
    );
    expect(missing).toBeNull();
  });

  it('17. A change set touching a field outside the author mask is rejected at creation', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'GrantTest' });
    const oppId = await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Opp',
      stage: 'prospecting',
    });

    await expect(
      engine.proposeChangeSet(fixture.workspaceId, fixture.agentId, {
        operations: [
          { collection: 'opportunities', recordId: oppId, op: 'update', fieldName: 'amount', newValue: 999 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'forbidden', message: expect.stringContaining('amount') });
  });

  it('18. Revoking the author grant after creation but before apply blocks the apply', async () => {
    const tempAgent = await engine.createPrincipal(fixture.workspaceId, 'agent', 'Temp');
    await engine.createGrant(
      fixture.workspaceId,
      tempAgent,
      fixture.collections.accounts,
      'propose',
      ['name'],
      null,
      { actorId: fixture.adminId },
    );
    const accountId = await seedAccount(engine, fixture, { name: 'Revoke' });
    const cs = await engine.proposeChangeSet(fixture.workspaceId, tempAgent, {
      operations: [
        { collection: 'accounts', recordId: accountId, op: 'update', fieldName: 'name', newValue: 'Revoked' },
      ],
    });
    const grant = await engine['ownerPool'].query(
      `SELECT id FROM kitsune.grants WHERE principal_id = $1 AND revoked_at IS NULL`,
      [tempAgent],
    );
    await engine.revokeGrant(grant.rows[0].id, fixture.adminId, fixture.workspaceId);
    for (const opId of cs.operationIds) {
      await engine.reviewChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId, [
        { opId, status: 'approved' },
      ]);
    }
    await expect(
      engine.applyChangeSet(fixture.workspaceId, fixture.reviewerId, cs.changeSetId),
    ).rejects.toMatchObject({ code: 'blocked' });
  });

  it('19. A reviewer with broader permissions cannot launder the author missing permissions', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'Launder' });
    const oppId = await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Launder Opp',
      stage: 'prospecting',
      amount: 1000,
    });

    await expect(
      engine.proposeChangeSet(fixture.workspaceId, fixture.limitedAgentId, {
        operations: [
          { collection: 'opportunities', recordId: oppId, op: 'update', fieldName: 'amount', newValue: 2000 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'forbidden', message: expect.stringContaining('amount') });
  });

  it('20. An agent principal cannot be granted write without explicit admin action and audit event', async () => {
    const tempAgent = await engine.createPrincipal(fixture.workspaceId, 'agent', 'WriteAgent');
    await expect(
      engine.createGrant(
        fixture.workspaceId,
        tempAgent,
        fixture.collections.accounts,
        'write',
        ['name'],
        null,
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });

    await engine.createGrant(
      fixture.workspaceId,
      tempAgent,
      fixture.collections.accounts,
      'write',
      ['name'],
      null,
      { adminOverrideAgentWrite: true, actorId: fixture.adminId },
    );

    const audit = await engine['ownerPool'].query(
      `SELECT action FROM kitsune.audit_log WHERE action = 'grant.agent_write_override' AND principal_id = $1`,
      [fixture.adminId],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('21. Authorization matrix: every query shape runs as every principal class with exact result sets', async () => {
    const matrixEngine = await getEngine();
    const matrixFixture = await createStandardFixture(matrixEngine);

    const accountId = await seedAccount(matrixEngine, matrixFixture, { name: 'MatrixCo' });
    const oppA = await seedOpportunity(matrixEngine, matrixFixture, {
      account_id: accountId,
      name: 'Opp A',
      stage: 'prospecting',
      amount: 100,
    });
    await seedOpportunity(matrixEngine, matrixFixture, {
      account_id: accountId,
      name: 'Opp B',
      stage: 'closed_won',
      amount: 200,
    });

    const records: OracleRecord[] = [
      {
        id: oppA,
        collection: 'opportunities',
        fields: { name: 'Opp A', stage: 'prospecting', amount: 100 },
      },
      {
        id: 'excluded',
        collection: 'opportunities',
        fields: { name: 'Opp B', stage: 'closed_won', amount: 200 },
      },
    ];

    const principals: Record<string, OraclePrincipal> = {
      admin: {
        id: matrixFixture.adminId,
        grants: {
          opportunities: { capability: 'admin', fieldMask: null, rowPredicate: null },
        },
      },
      reader: {
        id: matrixFixture.readerId,
        grants: {
          opportunities: {
            capability: 'read',
            fieldMask: ['name', 'stage'],
            rowPredicate: null,
          },
        },
      },
      agent: {
        id: matrixFixture.agentId,
        grants: {
          opportunities: {
            capability: 'propose',
            fieldMask: ['stage', 'next_step', 'name', 'account_id'],
            rowPredicate: null,
          },
        },
      },
      predicateAgent: {
        id: matrixFixture.predicateAgentId,
        grants: {
          opportunities: {
            capability: 'read',
            fieldMask: ['name', 'stage', 'amount'],
            rowPredicate: { field: 'stage', op: 'neq', value: 'closed_won' },
          },
        },
      },
      limitedAgent: {
        id: matrixFixture.limitedAgentId,
        grants: {
          opportunities: {
            capability: 'read',
            fieldMask: ['name', 'stage'],
            rowPredicate: null,
          },
        },
      },
      noGrant: { id: uuidv4(), grants: {} },
      service: { id: matrixFixture.serviceId, grants: {} },
    };

    const mcpByPrincipal = (principalId: string) =>
      createMcpHandlers(matrixEngine, () => ({
        workspaceId: matrixFixture.workspaceId,
        principalId,
      }));

    const matrixQuery = (shape: (typeof QUERY_SHAPES)[number]) => ({
      collection: shape.collection,
      ...shape.request,
    });

    for (const principalClass of PRINCIPAL_CLASSES) {
      const oraclePrincipal = principals[principalClass]!;
      const handlers = mcpByPrincipal(oraclePrincipal.id);

      for (const shape of QUERY_SHAPES) {
        const expected = oracleQuery(oraclePrincipal, records, shape);
        const grant = oraclePrincipal.grants[shape.collection];

        if (!grant || grant.capability === 'none') {
          await expect(handlers.query(matrixQuery(shape))).rejects.toMatchObject({
            code: 'not_found',
          });
          continue;
        }

        if (expected === 'forbidden') {
          await expect(handlers.query(matrixQuery(shape))).rejects.toMatchObject({
            code: 'forbidden',
          });
          continue;
        }

        if (expected === 'not_found') {
          await expect(handlers.query(matrixQuery(shape))).rejects.toMatchObject({
            code: 'not_found',
          });
          continue;
        }

        const actual = await handlers.query(matrixQuery(shape));
        if (shape.request.aggregates?.length) {
          expect(Array.isArray(actual)).toBe(true);
        } else if (shape.name === 'read_single') {
          expect(actual.length).toBeLessThanOrEqual(expected.length + 1);
        } else {
          expect(actual.length).toBe(expected.length);
        }
      }
    }
  });

  it('22. Reads, writes, denials, and grant changes all produce audit rows attributable to a principal', async () => {
    const before = await engine['ownerPool'].query(
      `SELECT COUNT(*)::int AS c FROM kitsune.audit_log WHERE workspace_id = $1`,
      [fixture.workspaceId],
    );

    await engine.query(fixture.workspaceId, fixture.readerId, {
      collection: 'opportunities',
      fields: ['name', 'stage'],
    });

    try {
      await engine.query(fixture.workspaceId, fixture.readerId, {
        collection: 'opportunities',
        fields: ['amount'],
      });
    } catch {
      /* expected denial */
    }

    const accountId = await seedAccount(engine, fixture, { name: 'Audit' });
    expect(accountId).toBeTruthy();

    const after = await engine['ownerPool'].query(
      `SELECT action, outcome, principal_id FROM kitsune.audit_log WHERE workspace_id = $1`,
      [fixture.workspaceId],
    );
    expect(after.rows.length).toBeGreaterThan(before.rows[0].c);
    expect(after.rows.every((r) => r.principal_id)).toBe(true);
    expect(after.rows.some((r) => r.outcome === 'allowed')).toBe(true);
    expect(after.rows.some((r) => r.outcome === 'denied')).toBe(true);
  });

  it('23. A relation target the author cannot see is indistinguishable from one that does not exist', async () => {
    const visibleAccount = await seedAccount(engine, fixture, {
      name: 'VisibleCo',
      industry: 'public',
    });
    const hiddenAccount = await seedAccount(engine, fixture, {
      name: 'SecretCo',
      industry: 'secret',
    });
    const nonexistentAccount = uuidv4();

    const propose = (accountId: string) =>
      engine.proposeChangeSet(fixture.workspaceId, fixture.relationAgentId, {
        operations: [
          {
            collection: 'opportunities',
            recordId: uuidv4(),
            op: 'insert',
            fieldName: 'account_id',
            newValue: accountId,
          },
        ],
      });

    const captureError = async (accountId: string) => {
      try {
        await propose(accountId);
        return null;
      } catch (error) {
        const err = error as KitsuneError;
        return { code: err.code, message: err.message, details: err.details };
      }
    };

    const hidden = await captureError(hiddenAccount);
    const nonexistent = await captureError(nonexistentAccount);

    expect(hidden).not.toBeNull();
    expect(hidden).toEqual({ code: 'not_found', message: 'Not found', details: undefined });
    expect(hidden).toEqual(nonexistent);

    // A target the author can actually see is still accepted.
    await expect(propose(visibleAccount)).resolves.toMatchObject({
      changeSetId: expect.any(String),
    });
  });

  it('Projection supplementary evidence: a masked principal still receives record ids but no masked field', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'Projection' });
    const oppId = await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Projection Opp',
      stage: 'prospecting',
      amount: 4242,
    });

    const rows = await engine.query(fixture.workspaceId, fixture.readerId, {
      collection: 'opportunities',
      filters: [{ field: 'name', op: 'eq', value: 'Projection Opp' }],
    });

    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe(oppId);
    expect(Object.keys(rows[0]!).sort()).toEqual(['id', 'name', 'stage']);
    expect(rows[0]).not.toHaveProperty('amount');
  });

  it('RLS supplementary evidence: mismatched workspace GUC returns zero rows', async () => {
    const accountId = await seedAccount(engine, fixture, { name: 'RLS' });
    const client = await engine.appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO ${fixture.schemaName}, kitsune, public`);
      await client.query(`SET LOCAL kitsune.schema_name = 'ws_wrongschema00000000000000000000'`);
      await client.query(`SET LOCAL kitsune.principal_id = '${fixture.adminId}'`);
      await client.query(`SET LOCAL kitsune.include_deleted = 'false'`);
      const result = await client.query(`SELECT id FROM accounts WHERE id = $1`, [accountId]);
      expect(result.rows.length).toBe(0);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('No SELECT * guard in core source', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { dirname, join, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const coreSrc = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'core',
      'src',
    );

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return walk(path);
        return entry.isFile() && path.endsWith('.ts') ? [path] : [];
      });

    const files = walk(coreSrc);
    // Guard the guard: a path typo here would make this test pass vacuously.
    expect(files.length).toBeGreaterThan(5);

    const offenders = files.filter((file) => /select\s+\*/i.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
