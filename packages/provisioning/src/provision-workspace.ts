import type { KitsuneEngine } from '@kitsuneos/core';
import {
  assertPlanLimit,
  claimInvitesForUser,
  createApiKey,
  ensureOwnerMembership,
} from '@kitsuneos/core';
import { v4 as uuidv4 } from 'uuid';
import {
  defineStarterCollections,
  grantAssistantOnStarters,
  grantOwnerOnStarters,
} from './seed-collections.js';

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

      const ids = await defineStarterCollections(engine, workspaceId);
      created.push('collection:accounts');
      created.push('collection:contacts');
      created.push('collection:opportunities');
      created.push('collection:notes');
      created.push('collection:posts');

      const assistantId = await engine.createPrincipal(
        workspaceId,
        'agent',
        'assistant',
      );
      created.push('principal:assistant');

      await grantOwnerOnStarters(
        engine,
        workspaceId,
        principalId,
        ids,
        created,
      );
      await grantAssistantOnStarters(
        engine,
        workspaceId,
        principalId,
        assistantId,
        ids,
      );
      created.push('grant:assistant:collections');

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

      // Connect keys belong to the assistant agent (propose-only), not the human.
      const apiKey = await createApiKey(engine.ownerPool, assistantId);
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

      await ensureOwnerMembership(engine.ownerPool, {
        userId,
        workspaceId,
        principalId,
        email: input.email,
      });
      created.push('membership:owner');

      const claimed = await claimInvitesForUser(engine.ownerPool, {
        userId,
        email: input.email,
      });
      if (claimed > 0) {
        created.push(`membership:claimed:${claimed}`);
      }

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

export interface CreateAdditionalWorkspaceInput {
  userId: string;
  email: string;
  name?: string;
  /** When true (default), set users.workspace_id to the new workspace. */
  activate?: boolean;
}

export interface CreateAdditionalWorkspaceResult {
  workspaceId: string;
  principalId: string;
  schemaName: string;
  workspaceName: string;
  apiKeyPlaintext: string | null;
  created: string[];
}

/**
 * Create another workspace for an existing user (multi-workspace accounts).
 * Seeds the same starter databases + assistant as first-time provision.
 */
export async function createAdditionalWorkspaceForUser(
  engine: KitsuneEngine,
  input: CreateAdditionalWorkspaceInput,
): Promise<CreateAdditionalWorkspaceResult> {
  await assertPlanLimit(engine.ownerPool, {
    dimension: 'workspacesPerUser',
    userId: input.userId,
  });

  const created: string[] = [];
  const activate = input.activate !== false;
  const displayName =
    input.name?.trim() || `Workspace ${new Date().toISOString().slice(0, 10)}`;

  const slug = `ws-${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const { workspaceId, schemaName } = await engine.createWorkspace(slug);
  created.push('workspace');

  await engine.ownerPool.query(
    `UPDATE kitsune.workspaces SET name = $2 WHERE id = $1`,
    [workspaceId, displayName],
  );

  const principalId = await engine.createPrincipal(
    workspaceId,
    'human',
    input.email,
  );
  created.push('principal');

  const ids = await defineStarterCollections(engine, workspaceId);
  created.push('collection:accounts');
  created.push('collection:contacts');
  created.push('collection:opportunities');
  created.push('collection:notes');
  created.push('collection:posts');

  const assistantId = await engine.createPrincipal(
    workspaceId,
    'agent',
    'assistant',
  );
  created.push('principal:assistant');

  await grantOwnerOnStarters(engine, workspaceId, principalId, ids, created);
  await grantAssistantOnStarters(
    engine,
    workspaceId,
    principalId,
    assistantId,
    ids,
  );
  created.push('grant:assistant:collections');

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

  const apiKey = await createApiKey(engine.ownerPool, assistantId);
  created.push('api_key');

  await ensureOwnerMembership(engine.ownerPool, {
    userId: input.userId,
    workspaceId,
    principalId,
    email: input.email,
  });
  created.push('membership:owner');

  if (activate) {
    await engine.ownerPool.query(
      `UPDATE kitsune.users
          SET workspace_id = $2,
              principal_id = $3,
              pending_api_key = $4
        WHERE id = $1`,
      [input.userId, workspaceId, principalId, apiKey.plaintext],
    );
    created.push('activated');
  }

  return {
    workspaceId,
    principalId,
    schemaName,
    workspaceName: displayName,
    apiKeyPlaintext: apiKey.plaintext,
    created,
  };
}

export {
  ensureNotesCollection,
  NOTES_COLLECTION,
  NOTES_DEFINITION,
} from './seed-collections.js';
