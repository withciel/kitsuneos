import { migrate, DEFAULT_CONFIG, KitsuneEngine } from '@kitsuneos/core';
import type { KitsuneEngine as EngineType } from '@kitsuneos/core';
import { v4 as uuidv4 } from 'uuid';

let sharedEngine: EngineType | null = null;

export async function getEngine(): Promise<EngineType> {
  if (!sharedEngine) {
    await migrate(DEFAULT_CONFIG);
    sharedEngine = new KitsuneEngine({ config: DEFAULT_CONFIG });
  }
  return sharedEngine;
}

export interface Fixture {
  workspaceId: string;
  schemaName: string;
  adminId: string;
  agentId: string;
  readerId: string;
  reviewerId: string;
  limitedAgentId: string;
  predicateAgentId: string;
  serviceId: string;
  collections: {
    accounts: string;
    contacts: string;
    opportunities: string;
  };
}

export async function createStandardFixture(engine: KitsuneEngine): Promise<Fixture> {
  const { workspaceId, schemaName } = await engine.createWorkspace(`test-${uuidv4().slice(0, 8)}`);
  const adminId = await engine.createPrincipal(workspaceId, 'human', 'Admin');
  const agentId = await engine.createPrincipal(workspaceId, 'agent', 'Agent');
  const readerId = await engine.createPrincipal(workspaceId, 'human', 'Reader');
  const reviewerId = await engine.createPrincipal(workspaceId, 'human', 'Reviewer');
  const limitedAgentId = await engine.createPrincipal(workspaceId, 'agent', 'Limited Agent');
  const predicateAgentId = await engine.createPrincipal(workspaceId, 'agent', 'Predicate Agent');
  const serviceId = await engine.createPrincipal(workspaceId, 'service', 'Service');

  const accounts = await engine.defineCollection(workspaceId, {
    name: 'accounts',
    fields: [
      { name: 'name', type: 'text', nullable: false },
      { name: 'industry', type: 'text' },
    ],
  });

  await engine.defineCollection(workspaceId, {
    name: 'contacts',
    fields: [
      { name: 'account_id', type: 'relation', relationTarget: 'accounts', nullable: false },
      { name: 'name', type: 'text', nullable: false },
      { name: 'email', type: 'text' },
    ],
  });

  const opportunities = await engine.defineCollection(workspaceId, {
    name: 'opportunities',
    fields: [
      { name: 'account_id', type: 'relation', relationTarget: 'accounts', nullable: false },
      { name: 'name', type: 'text', nullable: false },
      { name: 'amount', type: 'number' },
      {
        name: 'stage',
        type: 'enum',
        nullable: false,
        enumValues: ['prospecting', 'negotiation', 'closed_won', 'closed_lost'],
        indexed: true,
      },
      { name: 'next_step', type: 'prose' },
    ],
  });

  const contacts = (await engine['ownerPool'].query(
    `SELECT id FROM kitsune.collections WHERE workspace_id = $1 AND name = 'contacts'`,
    [workspaceId],
  )  ).rows[0].id as string;

  await engine.createGrant(workspaceId, adminId, accounts, 'admin', null, null, { actorId: adminId });
  await engine.createGrant(workspaceId, adminId, opportunities, 'admin', null, null, { actorId: adminId });
  await engine.createGrant(workspaceId, adminId, contacts, 'admin', null, null, { actorId: adminId });

  await engine.createGrant(workspaceId, reviewerId, opportunities, 'write', null, null, { actorId: adminId });
  await engine.createGrant(workspaceId, reviewerId, accounts, 'write', null, null, { actorId: adminId });

  await engine.createGrant(workspaceId, agentId, opportunities, 'propose', ['stage', 'next_step', 'name', 'account_id'], null, { actorId: adminId });
  await engine.createGrant(workspaceId, agentId, accounts, 'propose', ['name', 'industry'], null, { actorId: adminId });

  await engine.createGrant(workspaceId, readerId, opportunities, 'read', ['name', 'stage'], null, { actorId: adminId });
  await engine.createGrant(
    workspaceId,
    limitedAgentId,
    opportunities,
    'propose',
    ['name', 'stage'],
    null,
    { actorId: adminId },
  );

  await engine.createGrant(
    workspaceId,
    predicateAgentId,
    opportunities,
    'read',
    ['name', 'stage', 'amount'],
    { field: 'stage', op: 'neq', value: 'closed_won' },
    { actorId: adminId },
  );

  await engine.createGrant(
    workspaceId,
    predicateAgentId,
    opportunities,
    'propose',
    ['stage', 'next_step'],
    { field: 'stage', op: 'neq', value: 'closed_won' },
    { actorId: adminId },
  );

  return {
    workspaceId,
    schemaName,
    adminId,
    agentId,
    readerId,
    reviewerId,
    limitedAgentId,
    predicateAgentId,
    serviceId,
    collections: { accounts, contacts, opportunities },
  };
}

export async function seedAccount(
  engine: KitsuneEngine,
  fixture: Fixture,
  data: { name: string; industry?: string },
): Promise<string> {
  return engine.directWrite(fixture.workspaceId, fixture.adminId, 'accounts', data);
}

export async function seedOpportunity(
  engine: KitsuneEngine,
  fixture: Fixture,
  data: {
    account_id: string;
    name: string;
    amount?: number;
    stage: string;
    next_step?: string;
  },
): Promise<string> {
  return engine.directWrite(fixture.workspaceId, fixture.adminId, 'opportunities', data);
}

export async function getRevisionCount(
  engine: KitsuneEngine,
  schemaName: string,
  table: string,
  recordId: string,
): Promise<number> {
  const result = await engine['ownerPool'].query(
    `SELECT COUNT(*)::int AS c FROM ${schemaName}.${table}__rev WHERE record_id = $1`,
    [recordId],
  );
  return result.rows[0].c as number;
}

export async function getRecordRevision(
  engine: KitsuneEngine,
  schemaName: string,
  table: string,
  recordId: string,
): Promise<number> {
  const result = await engine['ownerPool'].query(
    `SELECT _revision FROM ${schemaName}.${table} WHERE id = $1`,
    [recordId],
  );
  return Number(result.rows[0]._revision);
}
