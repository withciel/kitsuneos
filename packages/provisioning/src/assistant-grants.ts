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

/**
 * Idempotent: create only the default assistant grants that are missing.
 * Does not widen or revoke existing grants.
 */
export async function ensureAssistantGrantsForWorkspace(
  engine: KitsuneEngine,
  workspaceId: string,
  ownerPrincipalId: string,
  assistantId: string,
): Promise<void> {
  const collections = await engine.listWorkspaceCollectionNames(workspaceId);
  for (const { id: collectionId, name } of collections) {
    const spec = defaultAssistantGrantForCollection(name);
    if (!spec) continue;

    const hasGrant = await engine.hasActiveGrant({
      workspaceId,
      principalId: assistantId,
      collectionId,
    });
    if (hasGrant) continue;

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
}
