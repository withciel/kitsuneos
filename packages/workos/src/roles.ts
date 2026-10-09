/** Map Kitsune workspace roles ↔ WorkOS organization role slugs. */
export type KitsuneWorkspaceRole = 'owner' | 'admin' | 'member';

export function toWorkOSRoleSlug(role: KitsuneWorkspaceRole): string {
  return role;
}

export function fromWorkOSRoleSlug(
  slug: string | null | undefined,
): KitsuneWorkspaceRole {
  if (slug === 'owner' || slug === 'admin') return slug;
  return 'member';
}

/** Default Agent Auth blueprint name for Kitsune first-party agents. */
export const KITSUNE_AGENT_BLUEPRINT_NAME = 'KitsuneOS Agent';

/** Permission ceiling for autonomous Kitsune agents (WorkOS RBAC). */
export const KITSUNE_AGENT_PERMISSIONS = [
  'kitsune:propose',
  'kitsune:read',
] as const;
