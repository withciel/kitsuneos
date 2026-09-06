import type { KitsuneEngine } from '@kitsuneos/core';

export const NOTES_COLLECTION = 'notes';

export const NOTES_DEFINITION = {
  name: NOTES_COLLECTION,
  fields: [
    { name: 'title', type: 'text' as const, nullable: false },
    { name: 'body', type: 'prose' as const },
    { name: 'tags', type: 'text' as const },
  ],
};

/** CMS starter: title/body plus draft|published|archived status enum. */
export const POSTS_COLLECTION = 'posts';

export const POSTS_DEFINITION = {
  name: POSTS_COLLECTION,
  fields: [
    { name: 'title', type: 'text' as const, nullable: false },
    { name: 'body', type: 'prose' as const },
    {
      name: 'status',
      type: 'enum' as const,
      nullable: false,
      enumValues: ['draft', 'published', 'archived'],
      indexed: true,
    },
  ],
};

export interface StarterCollectionIds {
  accountsId: string;
  contactsId: string;
  opportunitiesId: string;
  notesId: string;
  postsId: string;
}

/**
 * CRM starter databases, personal `notes`, and CMS `posts`.
 * Caller is responsible for grants and seed rows.
 */
export async function defineStarterCollections(
  engine: KitsuneEngine,
  workspaceId: string,
): Promise<StarterCollectionIds> {
  const accountsId = await engine.defineCollection(workspaceId, {
    name: 'accounts',
    fields: [
      { name: 'name', type: 'text', nullable: false },
      { name: 'industry', type: 'text' },
    ],
  });

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
        enumValues: ['prospecting', 'negotiation', 'closed_won', 'closed_lost'],
        indexed: true,
      },
      { name: 'next_step', type: 'prose' },
    ],
  });

  const notesId = await engine.defineCollection(workspaceId, NOTES_DEFINITION);
  const postsId = await engine.defineCollection(workspaceId, POSTS_DEFINITION);

  return { accountsId, contactsId, opportunitiesId, notesId, postsId };
}

export async function grantOwnerOnStarters(
  engine: KitsuneEngine,
  workspaceId: string,
  principalId: string,
  ids: StarterCollectionIds,
  created: string[],
): Promise<void> {
  for (const [collectionId, collectionName] of [
    [ids.accountsId, 'accounts'],
    [ids.contactsId, 'contacts'],
    [ids.opportunitiesId, 'opportunities'],
    [ids.notesId, NOTES_COLLECTION],
    [ids.postsId, POSTS_COLLECTION],
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
}

export async function grantAssistantOnStarters(
  engine: KitsuneEngine,
  workspaceId: string,
  ownerPrincipalId: string,
  assistantId: string,
  ids: StarterCollectionIds,
): Promise<void> {
  await engine.createGrant(
    workspaceId,
    assistantId,
    ids.accountsId,
    'propose',
    null,
    null,
    { actorId: ownerPrincipalId },
  );
  await engine.createGrant(
    workspaceId,
    assistantId,
    ids.contactsId,
    'propose',
    null,
    null,
    { actorId: ownerPrincipalId },
  );
  await engine.createGrant(
    workspaceId,
    assistantId,
    ids.opportunitiesId,
    'propose',
    ['name', 'stage', 'next_step'],
    null,
    { actorId: ownerPrincipalId },
  );
  await engine.createGrant(
    workspaceId,
    assistantId,
    ids.notesId,
    'propose',
    ['title', 'body', 'tags'],
    null,
    { actorId: ownerPrincipalId },
  );
  await engine.createGrant(
    workspaceId,
    assistantId,
    ids.postsId,
    'propose',
    ['title', 'body', 'status'],
    null,
    { actorId: ownerPrincipalId },
  );
}

/**
 * Idempotent: ensure the personal `notes` collection exists and the given
 * principal has admin. Used for workspaces provisioned before notes shipped.
 */
export async function ensureNotesCollection(
  engine: KitsuneEngine,
  workspaceId: string,
  principalId: string,
): Promise<{ collectionId: string; created: boolean }> {
  const existing = await engine.ownerPool.query<{ id: string }>(
    `SELECT id FROM kitsune.collections
      WHERE workspace_id = $1 AND name = $2`,
    [workspaceId, NOTES_COLLECTION],
  );
  if (existing.rows[0]) {
    const collectionId = existing.rows[0].id;
    const grant = await engine.ownerPool.query<{ id: string }>(
      `SELECT id FROM kitsune.grants
        WHERE workspace_id = $1
          AND principal_id = $2
          AND collection_id = $3
          AND revoked_at IS NULL
        LIMIT 1`,
      [workspaceId, principalId, collectionId],
    );
    if (!grant.rows[0]) {
      await engine.createGrant(
        workspaceId,
        principalId,
        collectionId,
        'admin',
        null,
        null,
        { actorId: principalId },
      );
    }
    return { collectionId, created: false };
  }

  const collectionId = await engine.defineCollection(
    workspaceId,
    NOTES_DEFINITION,
  );
  await engine.createGrant(
    workspaceId,
    principalId,
    collectionId,
    'admin',
    null,
    null,
    { actorId: principalId },
  );
  return { collectionId, created: true };
}
