import type { KitsuneEngine } from '@kitsuneos/core';
import {
  emitAuditEvent,
  ensureOrganization,
  isWorkOSConfigured,
} from '@kitsuneos/workos';

/**
 * Mirror a Kitsune workspace to a WorkOS Organization and stamp the id.
 * Soft-fails when WorkOS is not configured (local demo).
 */
export async function syncWorkspaceToWorkOS(
  engine: KitsuneEngine,
  input: {
    workspaceId: string;
    name: string;
    ownerWorkosUserId?: string;
  },
): Promise<string | null> {
  if (!isWorkOSConfigured()) return null;

  const existing = await engine.getWorkspaceWorkosOrganizationId(
    input.workspaceId,
  );
  if (existing) return existing;

  const org = await ensureOrganization({
    workspaceId: input.workspaceId,
    name: input.name,
    ownerWorkosUserId: input.ownerWorkosUserId,
  });
  if (!org) return null;

  await engine.setWorkspaceWorkosOrganizationId(
    input.workspaceId,
    org.organizationId,
  );

  if (org.created && input.ownerWorkosUserId) {
    await emitAuditEvent({
      organizationId: org.organizationId,
      action: 'workspace.created',
      actor: { type: 'user', id: input.ownerWorkosUserId },
      targets: [
        {
          type: 'workspace',
          id: input.workspaceId,
          name: input.name,
        },
      ],
      metadata: { source: 'kitsune_provision' },
      idempotencyKey: `workspace.created:${input.workspaceId}`,
    });
  }

  return org.organizationId;
}
