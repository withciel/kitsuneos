import {
  defaultAssistantGrantForCollection,
  ensureAssistantGrantsForWorkspace,
  provisionUserWorkspace,
  QUICKSTART_ASSISTANT_FORBIDDEN_COLLECTIONS,
  QUICKSTART_ASSISTANT_OPPORTUNITY_FIELDS,
} from '@kitsuneos/provisioning';
import { v4 as uuidv4 } from 'uuid';
import { describe, expect, it } from 'vitest';
import { getEngine, seedProvisionedCrmForTests } from './fixtures.js';

describe('Assistant grants align with quickstart mask', () => {
  it('defaultAssistantGrantForCollection never grants accounts or contacts', () => {
    for (const name of QUICKSTART_ASSISTANT_FORBIDDEN_COLLECTIONS) {
      expect(defaultAssistantGrantForCollection(name)).toBeNull();
    }
  });

  it('defaultAssistantGrantForCollection matches README opportunity mask', () => {
    const spec = defaultAssistantGrantForCollection('opportunities');
    expect(spec).toEqual({
      capability: 'propose',
      fieldMask: [...QUICKSTART_ASSISTANT_OPPORTUNITY_FIELDS],
    });
  });

  it('seedProvisionedCrm assistant describe_schema matches quickstart', async () => {
    const engine = await getEngine();
    const provisioned = await provisionUserWorkspace(engine, {
      workosId: `grant_align_${uuidv4()}`,
      email: `grant-align-${uuidv4()}@example.com`,
    });
    const { assistantId } = await seedProvisionedCrmForTests(
      engine,
      provisioned.workspaceId,
      provisioned.principalId,
      { withAssistant: true },
    );
    if (!assistantId) {
      throw new Error('expected assistant principal');
    }

    const schema = await engine.describeSchema(
      provisioned.workspaceId,
      assistantId,
    );
    const collectionNames = schema.collections.map((c) => c.name).sort();
    expect(collectionNames).not.toContain('accounts');
    expect(collectionNames).not.toContain('contacts');

    const opportunities = schema.collections.find(
      (c) => c.name === 'opportunities',
    );
    expect(opportunities?.capability).toBe('propose');
    expect(opportunities?.fields.every((f) => f.writable === false)).toBe(true);
    const proposable = opportunities?.fields
      .filter((f) => f.proposable)
      .map((f) => f.name)
      .sort();
    expect(proposable).toEqual(
      [...QUICKSTART_ASSISTANT_OPPORTUNITY_FIELDS].sort(),
    );
    const readable = opportunities?.fields
      .filter((f) => f.readable)
      .map((f) => f.name)
      .sort();
    expect(readable).toEqual(
      [...QUICKSTART_ASSISTANT_OPPORTUNITY_FIELDS].sort(),
    );
    expect(opportunities?.fields.some((f) => f.name === 'amount')).toBe(false);
  });

  it('ensureAssistantGrantsForWorkspace does not add full propose on CRM tables', async () => {
    const engine = await getEngine();
    const provisioned = await provisionUserWorkspace(engine, {
      workosId: `connect_grants_${uuidv4()}`,
      email: `connect-grants-${uuidv4()}@example.com`,
    });
    await seedProvisionedCrmForTests(
      engine,
      provisioned.workspaceId,
      provisioned.principalId,
    );
    const assistantId = await engine.createPrincipal(
      provisioned.workspaceId,
      'agent',
      'assistant',
    );

    await ensureAssistantGrantsForWorkspace(
      engine,
      provisioned.workspaceId,
      provisioned.principalId,
      assistantId,
    );

    const schema = await engine.describeSchema(
      provisioned.workspaceId,
      assistantId,
    );
    expect(schema.collections.map((c) => c.name)).not.toContain('accounts');
    expect(schema.collections.map((c) => c.name)).not.toContain('contacts');

    const opportunities = schema.collections.find(
      (c) => c.name === 'opportunities',
    );
    expect(opportunities?.capability).toBe('propose');
    expect(
      opportunities?.fields
        .filter((f) => f.proposable)
        .map((f) => f.name)
        .sort(),
    ).toEqual([...QUICKSTART_ASSISTANT_OPPORTUNITY_FIELDS].sort());
  });

  it('ensureAssistantGrantsForWorkspace remasks legacy broad opportunities grants', async () => {
    const engine = await getEngine();
    const provisioned = await provisionUserWorkspace(engine, {
      workosId: `legacy_grants_${uuidv4()}`,
      email: `legacy-grants-${uuidv4()}@example.com`,
    });
    await seedProvisionedCrmForTests(
      engine,
      provisioned.workspaceId,
      provisioned.principalId,
    );
    const assistantId = await engine.createPrincipal(
      provisioned.workspaceId,
      'agent',
      'assistant',
    );
    const opportunitiesId = await engine.findCollectionId(
      provisioned.workspaceId,
      'opportunities',
    );
    if (!opportunitiesId) {
      throw new Error('expected opportunities collection');
    }

    await engine.createGrant(
      provisioned.workspaceId,
      assistantId,
      opportunitiesId,
      'propose',
      null,
      null,
      { actorId: provisioned.principalId },
    );
    const accountsId = await engine.findCollectionId(
      provisioned.workspaceId,
      'accounts',
    );
    if (!accountsId) {
      throw new Error('expected accounts collection');
    }
    await engine.createGrant(
      provisioned.workspaceId,
      assistantId,
      accountsId,
      'propose',
      null,
      null,
      { actorId: provisioned.principalId },
    );

    await ensureAssistantGrantsForWorkspace(
      engine,
      provisioned.workspaceId,
      provisioned.principalId,
      assistantId,
    );

    const schema = await engine.describeSchema(
      provisioned.workspaceId,
      assistantId,
    );
    const collectionNames = schema.collections.map((c) => c.name);
    expect(collectionNames).not.toContain('accounts');
    expect(collectionNames).not.toContain('contacts');
    const opportunities = schema.collections.find(
      (c) => c.name === 'opportunities',
    );
    expect(
      opportunities?.fields
        .filter((f) => f.proposable)
        .map((f) => f.name)
        .sort(),
    ).toEqual([...QUICKSTART_ASSISTANT_OPPORTUNITY_FIELDS].sort());
    expect(schema.collections.some((c) => c.name === 'accounts')).toBe(false);
  });
});
