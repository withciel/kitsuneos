import { getWorkOS, isWorkOSConfigured } from './client.js';
import { type KitsuneWorkspaceRole, toWorkOSRoleSlug } from './roles.js';

export interface EnsureOrganizationInput {
  /** Kitsune workspace UUID — stored as WorkOS organization external_id. */
  workspaceId: string;
  name: string;
  /** WorkOS user id of the workspace owner (optional membership create). */
  ownerWorkosUserId?: string;
}

export interface EnsureOrganizationResult {
  organizationId: string;
  created: boolean;
  skipped: boolean;
}

/**
 * Ensure a WorkOS Organization exists for a Kitsune workspace.
 * Uses workspaceId as external_id for idempotent lookup.
 */
export async function ensureOrganization(
  input: EnsureOrganizationInput,
): Promise<EnsureOrganizationResult | null> {
  if (!isWorkOSConfigured()) return null;
  const workos = getWorkOS();
  if (!workos) return null;

  try {
    const existing = await workos.organizations.getOrganizationByExternalId(
      input.workspaceId,
    );
    if (input.ownerWorkosUserId) {
      await ensureMembership({
        organizationId: existing.id,
        workosUserId: input.ownerWorkosUserId,
        role: 'owner',
      });
    }
    return { organizationId: existing.id, created: false, skipped: false };
  } catch {
    // Not found — create below.
  }

  try {
    const org = await workos.organizations.createOrganization({
      name: input.name,
      externalId: input.workspaceId,
    });
    if (input.ownerWorkosUserId) {
      await ensureMembership({
        organizationId: org.id,
        workosUserId: input.ownerWorkosUserId,
        role: 'owner',
      });
    }
    return { organizationId: org.id, created: true, skipped: false };
  } catch (error) {
    // Race: another request created the org with the same external_id.
    const message = error instanceof Error ? error.message : String(error);
    if (/external.?id|already exists|conflict/i.test(message)) {
      try {
        const match = await workos.organizations.getOrganizationByExternalId(
          input.workspaceId,
        );
        return { organizationId: match.id, created: false, skipped: false };
      } catch {
        // fall through
      }
    }
    console.warn('[workos] ensureOrganization failed:', message);
    return null;
  }
}

export async function ensureMembership(input: {
  organizationId: string;
  workosUserId: string;
  role: KitsuneWorkspaceRole;
}): Promise<boolean> {
  const workos = getWorkOS();
  if (!workos) return false;
  try {
    const memberships = await workos.userManagement.listOrganizationMemberships(
      {
        organizationId: input.organizationId,
        userId: input.workosUserId,
        limit: 1,
      },
    );
    if (memberships.data[0]) {
      const current = memberships.data[0];
      const desired = toWorkOSRoleSlug(input.role);
      if (current.role?.slug !== desired) {
        await workos.userManagement.updateOrganizationMembership(current.id, {
          roleSlug: desired,
        });
      }
      return true;
    }
    await workos.userManagement.createOrganizationMembership({
      organizationId: input.organizationId,
      userId: input.workosUserId,
      roleSlug: toWorkOSRoleSlug(input.role),
    });
    return true;
  } catch (error) {
    console.warn(
      '[workos] ensureMembership failed:',
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export async function inviteToOrganization(input: {
  organizationId: string;
  email: string;
  role: KitsuneWorkspaceRole;
  inviterWorkosUserId?: string;
}): Promise<{ invitationId: string } | null> {
  const workos = getWorkOS();
  if (!workos) return null;
  try {
    const invitation = await workos.userManagement.sendInvitation({
      email: input.email.trim().toLowerCase(),
      organizationId: input.organizationId,
      roleSlug: toWorkOSRoleSlug(input.role),
      ...(input.inviterWorkosUserId
        ? { inviterUserId: input.inviterWorkosUserId }
        : {}),
    });
    return { invitationId: invitation.id };
  } catch (error) {
    console.warn(
      '[workos] inviteToOrganization failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
