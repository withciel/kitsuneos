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
  ownerPrincipalId: string,
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
    { actorId: ownerPrincipalId },
  );
}

/**
 * Idempotent: reconcile assistant grants to the quickstart-aligned defaults.
 * Revokes legacy broad grants on forbidden CRM collections and remasks opportunities.
 */
export async function ensureAssistantGrantsForWorkspace(
  engine: KitsuneEngine,
  workspaceId: string,
  ownerPrincipalId: string,
  assistantId: string,
): Promise<void> {
  const collections = await engine.listWorkspaceCollectionNames(workspaceId);
  const grants = await engine.listGrants(workspaceId, ownerPrincipalId);
  const activeAssistantGrants = grants.filter(
    (grant) => grant.principalId === assistantId && grant.revokedAt === null,
  );

  for (const grant of activeAssistantGrants) {
    if (
      (
        QUICKSTART_ASSISTANT_FORBIDDEN_COLLECTIONS as readonly string[]
      ).includes(grant.collection)
    ) {
      await engine.revokeGrant(grant.id, ownerPrincipalId, workspaceId);
    }
  }

  const opportunitiesSpec = defaultAssistantGrantForCollection('opportunities');
  if (opportunitiesSpec) {
    for (const grant of activeAssistantGrants.filter(
      (row) => row.collection === 'opportunities',
    )) {
      if (!grantMatchesSpec(grant, opportunitiesSpec)) {
        await engine.revokeGrant(grant.id, ownerPrincipalId, workspaceId);
      }
    }
  }

  const grantsAfter = await engine.listGrants(workspaceId, ownerPrincipalId);
  const activeAfter = grantsAfter.filter(
    (grant) => grant.principalId === assistantId && grant.revokedAt === null,
  );

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
      await engine.revokeGrant(grant.id, ownerPrincipalId, workspaceId);
    }

    await createAssistantGrant(
      engine,
      workspaceId,
      ownerPrincipalId,
      assistantId,
      collectionId,
      spec,
    );
  }
}
