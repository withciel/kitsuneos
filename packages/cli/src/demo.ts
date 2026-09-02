import type { KitsuneEngine } from '@kitsuneos/core';

/**
 * Fixed identifiers so the quickstart is idempotent and the README can quote
 * real, stable ids. The workspace id also fixes the Postgres schema name.
 */
export const DEMO = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  workspaceSlug: 'demo',
  ownerId: '22222222-2222-4222-8222-222222222222',
  assistantId: '33333333-3333-4333-8333-333333333333',
  accounts: {
    northwind: 'a0000000-0000-4000-8000-000000000001',
    globex: 'a0000000-0000-4000-8000-000000000002',
    initech: 'a0000000-0000-4000-8000-000000000003',
  },
  contacts: {
    dana: 'c0000000-0000-4000-8000-000000000001',
    raj: 'c0000000-0000-4000-8000-000000000002',
  },
  opportunities: {
    renewal: '0bbb0000-0000-4000-8000-000000000001',
    expansion: '0bbb0000-0000-4000-8000-000000000002',
    pilot: '0bbb0000-0000-4000-8000-000000000003',
  },
} as const;

export const DEMO_SCHEMA_NAME = `ws_${DEMO.workspaceId.replace(/-/g, '')}`;

export interface ProvisionResult {
  created: string[];
  skipped: string[];
}

async function workspaceExists(engine: KitsuneEngine): Promise<boolean> {
  const result = await engine.ownerPool.query(
    `SELECT 1 FROM kitsune.workspaces WHERE id = $1`,
    [DEMO.workspaceId],
  );
  return result.rows.length > 0;
}

async function collectionId(
  engine: KitsuneEngine,
  name: string,
): Promise<string | null> {
  const result = await engine.ownerPool.query<{ id: string }>(
    `SELECT id FROM kitsune.collections WHERE workspace_id = $1 AND name = $2`,
    [DEMO.workspaceId, name],
  );
  return result.rows[0]?.id ?? null;
}

async function principalExists(
  engine: KitsuneEngine,
  id: string,
): Promise<boolean> {
  const result = await engine.ownerPool.query(
    `SELECT 1 FROM kitsune.principals WHERE id = $1`,
    [id],
  );
  return result.rows.length > 0;
}

async function recordExists(
  engine: KitsuneEngine,
  table: string,
  id: string,
): Promise<boolean> {
  const result = await engine.ownerPool.query(
    `SELECT 1 FROM ${DEMO_SCHEMA_NAME}.${table} WHERE id = $1`,
    [id],
  );
  return result.rows.length > 0;
}

async function grantExists(
  engine: KitsuneEngine,
  principalId: string,
  collection: string,
): Promise<boolean> {
  const result = await engine.ownerPool.query(
    `SELECT 1 FROM kitsune.grants g
       JOIN kitsune.collections c ON c.id = g.collection_id
      WHERE g.principal_id = $1 AND c.name = $2 AND g.revoked_at IS NULL`,
    [principalId, collection],
  );
  return result.rows.length > 0;
}

/**
 * Every step checks before it writes, so running the quickstart twice is a no-op
 * rather than an error or a duplicate.
 */
export async function provisionDemo(
  engine: KitsuneEngine,
): Promise<ProvisionResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  if (await workspaceExists(engine)) {
    skipped.push('workspace');
  } else {
    await engine.createWorkspace(DEMO.workspaceSlug, { workspaceId: DEMO.workspaceId });
    created.push('workspace');
  }

  for (const [id, kind, name] of [
    [DEMO.ownerId, 'human', 'owner'],
    [DEMO.assistantId, 'agent', 'assistant'],
  ] as const) {
    if (await principalExists(engine, id)) {
      skipped.push(`principal ${name}`);
    } else {
      await engine.createPrincipal(DEMO.workspaceId, kind, name, { principalId: id });
      created.push(`principal ${name}`);
    }
  }

  const collections: Record<string, string> = {};

  const existingAccounts = await collectionId(engine, 'accounts');
  if (existingAccounts) {
    collections.accounts = existingAccounts;
    skipped.push('collection accounts');
  } else {
    collections.accounts = await engine.defineCollection(DEMO.workspaceId, {
      name: 'accounts',
      fields: [
        { name: 'name', type: 'text', nullable: false },
        { name: 'industry', type: 'text' },
      ],
    });
    created.push('collection accounts');
  }

  const existingContacts = await collectionId(engine, 'contacts');
  if (existingContacts) {
    collections.contacts = existingContacts;
    skipped.push('collection contacts');
  } else {
    collections.contacts = await engine.defineCollection(DEMO.workspaceId, {
      name: 'contacts',
      fields: [
        { name: 'account_id', type: 'relation', relationTarget: 'accounts', nullable: false },
        { name: 'name', type: 'text', nullable: false },
        { name: 'email', type: 'text' },
      ],
    });
    created.push('collection contacts');
  }

  const existingOpportunities = await collectionId(engine, 'opportunities');
  if (existingOpportunities) {
    collections.opportunities = existingOpportunities;
    skipped.push('collection opportunities');
  } else {
    collections.opportunities = await engine.defineCollection(DEMO.workspaceId, {
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
    created.push('collection opportunities');
  }

  for (const collection of ['accounts', 'contacts', 'opportunities'] as const) {
    if (await grantExists(engine, DEMO.ownerId, collection)) {
      skipped.push(`grant owner/${collection}`);
    } else {
      await engine.createGrant(
        DEMO.workspaceId,
        DEMO.ownerId,
        collections[collection]!,
        'admin',
        null,
        null,
        { actorId: DEMO.ownerId },
      );
      created.push(`grant owner/${collection}`);
    }
  }

  // The assistant can read and propose exactly three fields. amount is absent on
  // purpose: it is what makes the rejection in the worked example real.
  if (await grantExists(engine, DEMO.assistantId, 'opportunities')) {
    skipped.push('grant assistant/opportunities');
  } else {
    await engine.createGrant(
      DEMO.workspaceId,
      DEMO.assistantId,
      collections.opportunities!,
      'propose',
      ['name', 'stage', 'next_step'],
      null,
      { actorId: DEMO.ownerId },
    );
    created.push('grant assistant/opportunities');
  }

  const seedAccounts = [
    { id: DEMO.accounts.northwind, name: 'Northwind Traders', industry: 'logistics' },
    { id: DEMO.accounts.globex, name: 'Globex', industry: 'manufacturing' },
    { id: DEMO.accounts.initech, name: 'Initech', industry: 'software' },
  ];
  for (const account of seedAccounts) {
    if (await recordExists(engine, 'accounts', account.id)) {
      skipped.push(`account ${account.name}`);
      continue;
    }
    await engine.directWrite(
      DEMO.workspaceId,
      DEMO.ownerId,
      'accounts',
      { name: account.name, industry: account.industry },
      { recordId: account.id },
    );
    created.push(`account ${account.name}`);
  }

  const seedContacts = [
    {
      id: DEMO.contacts.dana,
      account_id: DEMO.accounts.northwind,
      name: 'Dana Whitfield',
      email: 'dana@northwind.example',
    },
    {
      id: DEMO.contacts.raj,
      account_id: DEMO.accounts.globex,
      name: 'Raj Menon',
      email: 'raj@globex.example',
    },
  ];
  for (const contact of seedContacts) {
    if (await recordExists(engine, 'contacts', contact.id)) {
      skipped.push(`contact ${contact.name}`);
      continue;
    }
    await engine.directWrite(
      DEMO.workspaceId,
      DEMO.ownerId,
      'contacts',
      { account_id: contact.account_id, name: contact.name, email: contact.email },
      { recordId: contact.id },
    );
    created.push(`contact ${contact.name}`);
  }

  const seedOpportunities = [
    {
      id: DEMO.opportunities.renewal,
      account_id: DEMO.accounts.northwind,
      name: 'Northwind renewal',
      amount: 48000,
      stage: 'negotiation',
      next_step: 'Send updated pricing sheet',
    },
    {
      id: DEMO.opportunities.expansion,
      account_id: DEMO.accounts.globex,
      name: 'Globex expansion',
      amount: 120000,
      stage: 'prospecting',
      next_step: 'Book discovery call with procurement',
    },
    {
      id: DEMO.opportunities.pilot,
      account_id: DEMO.accounts.initech,
      name: 'Initech pilot',
      amount: 15000,
      stage: 'prospecting',
      next_step: 'Confirm pilot success criteria',
    },
  ];
  for (const opportunity of seedOpportunities) {
    if (await recordExists(engine, 'opportunities', opportunity.id)) {
      skipped.push(`opportunity ${opportunity.name}`);
      continue;
    }
    await engine.directWrite(
      DEMO.workspaceId,
      DEMO.ownerId,
      'opportunities',
      {
        account_id: opportunity.account_id,
        name: opportunity.name,
        amount: opportunity.amount,
        stage: opportunity.stage,
        next_step: opportunity.next_step,
      },
      { recordId: opportunity.id },
    );
    created.push(`opportunity ${opportunity.name}`);
  }

  return { created, skipped };
}
