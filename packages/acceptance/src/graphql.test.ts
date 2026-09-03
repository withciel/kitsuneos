import type { JsonValue, KitsuneEngine } from '@kitsuneos/core';
import { executeGraphql } from '@kitsuneos/graphql';
import { createHttpMcpServer, resetRateLimits } from '@kitsuneos/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createStandardFixture,
  type Fixture,
  getEngine,
  issueApiKey,
  seedAccount,
  seedOpportunity,
} from './fixtures.js';

describe('GraphQL and REST reads', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;
  let httpServer: ReturnType<typeof createHttpMcpServer>;
  let baseUrl: string;
  let adminKey: string;
  let serviceKey: string;
  let agentKey: string;
  let oppId: string;
  let accountId: string;

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
    accountId = await seedAccount(engine, fixture, { name: 'GqlCo' });
    oppId = await seedOpportunity(engine, fixture, {
      account_id: accountId,
      name: 'Gql Opp',
      stage: 'prospecting',
      amount: 42,
    });
    const otherAccount = await seedAccount(engine, fixture, {
      name: 'GqlCo 2',
    });
    await seedOpportunity(engine, fixture, {
      account_id: otherAccount,
      name: 'Gql Opp 2',
      stage: 'negotiation',
      amount: 99,
    });
    adminKey = (await issueApiKey(engine, fixture.adminId)).plaintext;
    serviceKey = (await issueApiKey(engine, fixture.serviceId)).plaintext;
    agentKey = (await issueApiKey(engine, fixture.limitedAgentId)).plaintext;
    httpServer = createHttpMcpServer(engine);
    const bound = await httpServer.listen();
    baseUrl = bound.url;
  });

  afterAll(async () => {
    await httpServer.close();
    resetRateLimits();
  });

  it('omits masked fields and collections the caller cannot see', async () => {
    const fieldsResult = await executeGraphql(
      engine,
      {
        workspaceId: fixture.workspaceId,
        principalId: fixture.limitedAgentId,
      },
      `{ __type(name: "Opportunity") { fields { name } } }`,
    );
    const names = (
      (
        fieldsResult.data as {
          __type: { fields: Array<{ name: string }> };
        }
      ).__type.fields ?? []
    ).map((field) => field.name);
    expect(names).toContain('name');
    expect(names).not.toContain('amount');

    const accountType = await executeGraphql(
      engine,
      {
        workspaceId: fixture.workspaceId,
        principalId: fixture.limitedAgentId,
      },
      `{ __type(name: "Account") { name } }`,
    );
    expect(accountType.data).toEqual({ __type: null });

    const amountQuery = await executeGraphql(
      engine,
      {
        workspaceId: fixture.workspaceId,
        principalId: fixture.limitedAgentId,
      },
      `{ opportunities { nodes { amount } } }`,
    );
    expect(amountQuery.errors?.length).toBeGreaterThan(0);
  });

  it('loads nested accounts with one batched query', async () => {
    let queryCalls = 0;
    const original = engine.query.bind(engine);
    engine.query = (async (
      workspaceId: string,
      principalId: string,
      request: Parameters<KitsuneEngine['query']>[2],
    ) => {
      queryCalls += 1;
      return original(workspaceId, principalId, request);
    }) as KitsuneEngine['query'];
    try {
      const result = await executeGraphql(
        engine,
        {
          workspaceId: fixture.workspaceId,
          principalId: fixture.adminId,
        },
        `{
          opportunities(first: 10) {
            nodes {
              name
              account { name }
            }
          }
        }`,
      );
      expect(result.errors).toBeUndefined();
      const nodes = (
        result.data as {
          opportunities: {
            nodes: Array<{ name: string; account: { name: string } | null }>;
          };
        }
      ).opportunities.nodes;
      expect(nodes.length).toBeGreaterThanOrEqual(2);
      expect(nodes.some((row) => row.account?.name === 'GqlCo')).toBe(true);
      expect(queryCalls).toBe(2);
    } finally {
      engine.query = original;
    }
  });

  it('REST GET returns identical 404 for missing and forbidden records', async () => {
    const missing = await fetch(
      `${baseUrl}/api/records/opportunities/${crypto.randomUUID()}`,
      { headers: { Authorization: `Bearer ${adminKey}` } },
    );
    const forbidden = await fetch(
      `${baseUrl}/api/records/opportunities/${oppId}`,
      { headers: { Authorization: `Bearer ${serviceKey}` } },
    );
    const missingBody = await missing.json();
    const forbiddenBody = await forbidden.json();
    expect(missing.status).toBe(404);
    expect(forbidden.status).toBe(404);
    expect(missingBody).toEqual({ error: 'Not found' });
    expect(forbiddenBody).toEqual({ error: 'Not found' });
    expect(JSON.stringify(missingBody)).toBe(JSON.stringify(forbiddenBody));
  });

  it('API-key GraphQL cannot select a masked amount field', async () => {
    const response = await fetch(`${baseUrl}/api/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${agentKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `{ opportunities { nodes { name amount } } }`,
      }),
    });
    const body = (await response.json()) as {
      errors?: Array<{ message: string }>;
    };
    expect(body.errors?.length).toBeGreaterThan(0);
  });

  it('maps aggregates including join onto engine.query', async () => {
    const result = await executeGraphql(
      engine,
      {
        workspaceId: fixture.workspaceId,
        principalId: fixture.adminId,
      },
      `query ($join: QueryJoinInput) {
        opportunitiesAggregate(
          groupBy: ["account.name"]
          join: $join
          aggregates: [{ fn: sum, field: "amount", alias: "total" }]
        )
      }`,
      { join: { field: 'account_id', as: 'account' } },
    );
    expect(result.errors).toBeUndefined();
    const rows = (
      result.data as {
        opportunitiesAggregate: Array<Record<string, JsonValue>>;
      }
    ).opportunitiesAggregate;
    expect(rows.some((row) => Number(row.total) >= 42)).toBe(true);
  });
});
