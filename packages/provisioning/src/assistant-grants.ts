import type { KitsuneEngine } from '@kitsuneos/core';

/**
 * Face-2 / README quickstart: assistant may propose only these opportunity fields.
 * `amount` and relation targets are intentionally excluded from the mask.
 */
export const QUICKSTART_ASSISTANT_OPPORTUNITY_FIELDS = [
  'name',
  'stage',
  'next_step',
] as const;

export type QuickstartAssistantOpportunityField =
  (typeof QUICKSTART_ASSISTANT_OPPORTUNITY_FIELDS)[number];

export interface AssistantCollectionGrantSpec {
  capability: 'propose';
  fieldMask: readonly string[] | null;
}

export interface EnsureAssistantGrantsOptions {
  /**
   * When true (workspace owner/admin only), revoke legacy broad grants and
   * align starter collections to the quickstart mask. When false, never
   * revoke or stack grants on collections that already have any active grant.
   */
  reconcile?: boolean;
}

/**
 * Default Connect / demo assistant grants for starter CRM collections.
 * Matches `packages/cli/src/demo.ts` quickstart provisioning (opportunities only,
 * narrow mask). Accounts and contacts are omitted so describe_schema hides them.
 */
export function defaultAssistantGrantForCollection(
  collectionName: string,
): AssistantCollectionGrantSpec | null {
  switch (collectionName) {
    case 'accounts':
    case 'contacts':
      return null;
    case 'opportunities':
      return {
        capability: 'propose',
        fieldMask: QUICKSTART_ASSISTANT_OPPORTUNITY_FIELDS,
      };
    case 'notes':
      return {
        capability: 'propose',
        fieldMask: ['title', 'body', 'tags'],
      };
    case 'posts':
      return {
        capability: 'propose',
        fieldMask: ['title', 'body', 'status'],
      };
    default:
      return null;
  }
}

/** Collections the quickstart assistant must never receive propose on. */
export const QUICKSTART_ASSISTANT_FORBIDDEN_COLLECTIONS = [
  'accounts',
  'contacts',
] as const;

function fieldMasksEqual(
  left: readonly string[] | null,
  right: readonly string[] | null,
): boolean {
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((value, index) => value === b[index]);
}

function grantMatchesSpec(
  grant: {
    capability: string;
    fieldMask: string[] | null;
    revokedAt: string | null;
  },
  spec: AssistantCollectionGrantSpec,
): boolean {
  if (grant.revokedAt) return false;
  return (
    grant.capability === spec.capability &&
    fieldMasksEqual(grant.fieldMask, spec.fieldMask)
  );
}

async function createAssistantGrant(
  engine: KitsuneEngine,
  workspaceId: string,
  actorPrincipalId: string,
  assistantId: string,
  collectionId: string,
  spec: AssistantCollectionGrantSpec,
): Promise<void> {
  await engine.createGrant(
    workspaceId,
    assistantId,
    collectionId,
    spec.capability,
    spec.fieldMask ? [...spec.fieldMask] : null,
    null,
    { actorId: actorPrincipalId },
  );
}

function activeGrantsForAssistant(
  grants: Array<{
    principalId: string;
    collection: string;
    capability: string;
    fieldMask: string[] | null;
    revokedAt: string | null;
    id: string;
  }>,
  assistantId: string,
): Array<{
  id: string;
  collection: string;
  capability: string;
  fieldMask: string[] | null;
  revokedAt: string | null;
}> {
  return grants
    .filter(
      (grant) => grant.principalId === assistantId && grant.revokedAt === null,
    )
    .map((grant) => ({
      id: grant.id,
      collection: grant.collection,
      capability: grant.capability,
      fieldMask: grant.fieldMask,
      revokedAt: grant.revokedAt,
    }));
}

async function reconcileAssistantGrants(
  engine: KitsuneEngine,
  workspaceId: string,
  actorPrincipalId: string,
  assistantId: string,
): Promise<void> {
  const collections = await engine.listWorkspaceCollectionNames(workspaceId);
  const assistantGrantRows = await engine.listGrantsForPrincipal(
    workspaceId,
    assistantId,
  );
  const activeAssistantGrants = activeGrantsForAssistant(
    assistantGrantRows,
    assistantId,
  );

  for (const grant of activeAssistantGrants) {
    if (
      (
        QUICKSTART_ASSISTANT_FORBIDDEN_COLLECTIONS as readonly string[]
      ).includes(grant.collection)
    ) {
      await engine.revokeGrant(grant.id, actorPrincipalId, workspaceId);
    }
  }

  const opportunitiesSpec = defaultAssistantGrantForCollection('opportunities');
  if (opportunitiesSpec) {
    for (const grant of activeAssistantGrants.filter(
      (row) => row.collection === 'opportunities',
    )) {
      if (!grantMatchesSpec(grant, opportunitiesSpec)) {
        await engine.revokeGrant(grant.id, actorPrincipalId, workspaceId);
      }
    }
  }

  const grantsAfter = await engine.listGrantsForPrincipal(
    workspaceId,
    assistantId,
  );
  const activeAfter = activeGrantsForAssistant(grantsAfter, assistantId);

  for (const { id: collectionId, name } of collections) {
    const spec = defaultAssistantGrantForCollection(name);
    if (!spec) continue;

    const onCollection = activeAfter.filter(
      (grant) => grant.collection === name,
    );
    if (onCollection.some((grant) => grantMatchesSpec(grant, spec))) {
      continue;
    }

    for (const grant of onCollection) {
      await engine.revokeGrant(grant.id, actorPrincipalId, workspaceId);
    }

    await createAssistantGrant(
      engine,
      workspaceId,
      actorPrincipalId,
      assistantId,
      collectionId,
      spec,
    );
  }
}

/**
 * Create missing default assistant grants without widening existing access.
 */
async function ensureMissingAssistantGrants(
  engine: KitsuneEngine,
  workspaceId: string,
  actorPrincipalId: string,
  assistantId: string,
): Promise<void> {
  const collections = await engine.listWorkspaceCollectionNames(workspaceId);
  const assistantGrantRows = await engine.listGrantsForPrincipal(
    workspaceId,
    assistantId,
  );
  const activeAssistantGrants = activeGrantsForAssistant(
    assistantGrantRows,
    assistantId,
  );

  for (const { id: collectionId, name } of collections) {
    const spec = defaultAssistantGrantForCollection(name);
    if (!spec) continue;

    if (activeAssistantGrants.some((grant) => grant.collection === name)) {
      continue;
    }

    const hasGrant = await engine.hasActiveGrant({
      workspaceId,
      principalId: assistantId,
      collectionId,
    });
    if (hasGrant) continue;

    await createAssistantGrant(
      engine,
      workspaceId,
      actorPrincipalId,
      assistantId,
      collectionId,
      spec,
    );
  }
}

/**
 * Idempotent assistant grant setup for Connect / demo seeds.
 */
export async function ensureAssistantGrantsForWorkspace(
  engine: KitsuneEngine,
  workspaceId: string,
  actorPrincipalId: string,
  assistantId: string,
  options?: EnsureAssistantGrantsOptions,
): Promise<void> {
  if (options?.reconcile) {
    await reconcileAssistantGrants(
      engine,
      workspaceId,
      actorPrincipalId,
      assistantId,
    );
    return;
  }
  await ensureMissingAssistantGrants(
    engine,
    workspaceId,
    actorPrincipalId,
    assistantId,
  );
}
