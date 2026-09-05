import type { KitsuneEngine } from '@kitsuneos/core';
import { createApiKey } from '@kitsuneos/core';
import { v4 as uuidv4 } from 'uuid';

export interface ProvisionUserInput {
  workosId: string;
  email: string;
}

export interface ProvisionUserResult {
  userId: string;
  workspaceId: string;
  principalId: string;
  schemaName: string;
  apiKeyPlaintext: string | null;
  created: string[];
  skipped: string[];
}

/**
 * Idempotent per workosId. Uses a dedicated pool client for the advisory lock
 * so lock and unlock cannot run on different pooled connections (which would
 * leave the lock held and hang later signup attempts).
 */
export async function provisionUserWorkspace(
  engine: KitsuneEngine,
  input: ProvisionUserInput,
): Promise<ProvisionUserResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  const lockClient = await engine.ownerPool.connect();
  try {
    await lockClient.query(`SELECT pg_advisory_lock(hashtext($1))`, [
      input.workosId,
    ]);

    try {
      const existing = await lockClient.query<{
        id: string;
        workspace_id: string;
        principal_id: string;
        schema_name: string;
      }>(
        `SELECT u.id, u.workspace_id, u.principal_id, w.schema_name
           FROM kitsune.users u
           JOIN kitsune.workspaces w ON w.id = u.workspace_id
          WHERE u.workos_id = $1`,
        [input.workosId],
      );
      if (existing.rows[0]) {
        return {
          userId: existing.rows[0].id,
          workspaceId: existing.rows[0].workspace_id,
          principalId: existing.rows[0].principal_id,
          schemaName: existing.rows[0].schema_name,
          apiKeyPlaintext: null,
          created,
          skipped: ['already provisioned'],
        };
      }

      const userId = uuidv4();
      const slug = `ws-${uuidv4().replace(/-/g, '').slice(0, 16)}`;
      const { workspaceId, schemaName } = await engine.createWorkspace(slug);
      created.push('workspace');

      const principalId = await engine.createPrincipal(
        workspaceId,
        'human',
        input.email,
        {
          externalIssuer: 'workos',
          externalSubject: input.workosId,
        },
      );
      created.push('principal');

      const accountsId = await engine.defineCollection(workspaceId, {
        name: 'accounts',
        fields: [
          { name: 'name', type: 'text', nullable: false },
          { name: 'industry', type: 'text' },
        ],
      });
      created.push('collection:accounts');

      const contactsId = await engine.defineCollection(workspaceId, {
        name: 'contacts',
        fields: [
          {
            name: 'account_id',
            type: 'relation',
            relationTarget: 'accounts',
            nullable: false,
          },
          { name: 'name', type: 'text', nullable: false },
          { name: 'email', type: 'text' },
        ],
      });
      created.push('collection:contacts');

      const opportunitiesId = await engine.defineCollection(workspaceId, {
        name: 'opportunities',
        fields: [
          {
            name: 'account_id',
            type: 'relation',
            relationTarget: 'accounts',
            nullable: false,
          },
          { name: 'name', type: 'text', nullable: false },
          { name: 'amount', type: 'number' },
          {
            name: 'stage',
            type: 'enum',
            nullable: false,
            enumValues: [
              'prospecting',
              'negotiation',
              'closed_won',
              'closed_lost',
            ],
            indexed: true,
          },
          { name: 'next_step', type: 'prose' },
        ],
      });
      created.push('collection:opportunities');

      const assistantId = await engine.createPrincipal(
        workspaceId,
        'agent',
        'assistant',
      );
      created.push('principal:assistant');

      for (const [collectionId, collectionName] of [
        [accountsId, 'accounts'],
        [contactsId, 'contacts'],
        [opportunitiesId, 'opportunities'],
      ] as const) {
        await engine.createGrant(
          workspaceId,
          principalId,
          collectionId,
          'admin',
          null,
          null,
          { actorId: principalId },
        );
        created.push(`grant:owner:${collectionName}`);
      }

      await engine.createGrant(
        workspaceId,
        assistantId,
        opportunitiesId,
        'propose',
        ['name', 'stage', 'next_step'],
        null,
        { actorId: principalId },
      );
      created.push('grant:assistant:opportunities');

      const accountId = uuidv4();
      await engine.directWrite(
        workspaceId,
        principalId,
        'accounts',
        { name: 'Starter Account', industry: 'software' },
        { recordId: accountId },
      );
      await engine.directWrite(workspaceId, principalId, 'opportunities', {
        account_id: accountId,
        name: 'Starter Opportunity',
        amount: 1000,
        stage: 'prospecting',
        next_step: 'Review KitsuneOS docs',
      });
      created.push('seed');

      const apiKey = await createApiKey(engine.ownerPool, principalId);
      created.push('api_key');

      // Persist one-time reveal: /api/schema often provisions first and drops
      // the in-memory key; Settings /api/me consumes and clears this column.
      await lockClient.query(
        `INSERT INTO kitsune.users
           (id, workos_id, email, workspace_id, principal_id, pending_api_key)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          input.workosId,
          input.email,
          workspaceId,
          principalId,
          apiKey.plaintext,
        ],
      );
      created.push('user');

      return {
        userId,
        workspaceId,
        principalId,
        schemaName,
        apiKeyPlaintext: apiKey.plaintext,
        created,
        skipped,
      };
    } finally {
      await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [
        input.workosId,
      ]);
    }
  } finally {
    lockClient.release();
  }
}
