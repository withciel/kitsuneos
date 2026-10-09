import { getWorkOS, isWorkOSConfigured } from './client.js';

export const FGA_AGENT_RESOURCE_TYPE = 'agent';

/**
 * Register a Kitsune agent principal as a WorkOS FGA resource under the org.
 * Uses Kitsune principal UUID as externalId for stable linkage.
 */
export async function registerAgentResource(input: {
  organizationId: string;
  principalId: string;
  name: string;
}): Promise<string | null> {
  if (!isWorkOSConfigured()) return null;
  const workos = getWorkOS();
  if (!workos) return null;

  try {
    const resource = await workos.authorization.createResource({
      organizationId: input.organizationId,
      resourceTypeSlug: FGA_AGENT_RESOURCE_TYPE,
      externalId: input.principalId,
      name: input.name,
      description: 'KitsuneOS agent principal',
    });
    return resource.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Idempotent: resource already exists for this external id.
    if (/already exists|conflict|duplicate/i.test(message)) {
      try {
        const existing = await workos.authorization.getResourceByExternalId({
          organizationId: input.organizationId,
          resourceTypeSlug: FGA_AGENT_RESOURCE_TYPE,
          externalId: input.principalId,
        });
        return existing.id;
      } catch {
        // fall through
      }
    }
    console.warn('[workos] registerAgentResource failed:', message);
    return null;
  }
}
