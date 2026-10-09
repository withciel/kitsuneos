import type { GenerateLinkIntent } from '@workos-inc/node';
import { getWorkOS, isWorkOSConfigured } from './client.js';

const PORTAL_INTENTS = new Set([
  'sso',
  'dsync',
  'audit_logs',
  'log_streams',
  'domain_verification',
  'certificate_renewal',
]);

export async function generateAdminPortalLink(input: {
  organizationId: string;
  intent: string;
  returnUrl?: string;
}): Promise<string | null> {
  if (!isWorkOSConfigured()) return null;
  const workos = getWorkOS();
  if (!workos) return null;
  if (!PORTAL_INTENTS.has(input.intent)) return null;

  try {
    const result = await workos.adminPortal.generateLink({
      organization: input.organizationId,
      intent: input.intent as GenerateLinkIntent,
      ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
    });
    return result.link;
  } catch (error) {
    console.warn(
      '[workos] generateAdminPortalLink failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Widget auth token scopes supported by WorkOS Widgets API. */
export type WidgetTokenScope =
  | 'widgets:users-table:manage'
  | 'widgets:sso:manage'
  | 'widgets:domain-verification:manage'
  | 'widgets:dsync:manage'
  | 'widgets:audit-log-streaming:manage'
  | 'widgets:api-keys:manage';

export async function createWidgetToken(input: {
  organizationId: string;
  workosUserId: string;
  scopes: WidgetTokenScope[];
}): Promise<string | null> {
  if (!isWorkOSConfigured()) return null;
  const workos = getWorkOS();
  if (!workos) return null;

  try {
    const result = await workos.widgets.createToken({
      organizationId: input.organizationId,
      userId: input.workosUserId,
      scopes: input.scopes,
    });
    return result.token;
  } catch (error) {
    console.warn(
      '[workos] createWidgetToken failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function listOrganizationFeatureFlags(
  organizationId: string,
): Promise<string[]> {
  const workos = getWorkOS();
  if (!workos) return [];
  try {
    const flags = await workos.featureFlags.listOrganizationFeatureFlags({
      organizationId,
    });
    return flags.data.map((f: { slug: string }) => f.slug);
  } catch {
    return [];
  }
}
