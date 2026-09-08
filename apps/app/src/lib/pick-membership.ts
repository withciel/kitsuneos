import type { WorkspaceMembership } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';

/** Prefer the stored active workspace; otherwise first membership. */
export function pickMembership(
  memberships: WorkspaceMembership[],
  preferredWorkspaceId: string | null,
): WorkspaceMembership {
  if (memberships.length === 0) {
    throw new KitsuneError('No workspace membership found', 'forbidden');
  }
  if (preferredWorkspaceId) {
    const preferred = memberships.find(
      (m) => m.workspaceId === preferredWorkspaceId,
    );
    if (preferred) {
      return preferred;
    }
  }
  return memberships[0]!;
}
