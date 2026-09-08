/**
 * AuthPort — session identity only (WorkOS / test header).
 *
 * Bearer credentials (API key, OAuth access token) are resolved separately via
 * KitsuneEngine.resolveApiKey / resolveOAuthAccessToken and composed in
 * resolveRequestAuth. Routes must not import AuthKit; they call requireWorkspace
 * (session) or resolveRequestAuth (bearer | session).
 */

export interface SessionIdentity {
  /** WorkOS user id, or test-header subject when allowed. */
  externalId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface AuthPort {
  /** Signed-in human, or null when unauthenticated. */
  getSessionIdentity(): Promise<SessionIdentity | null>;
}

/**
 * Production AuthPort: optional test header (local/demo), else WorkOS AuthKit.
 * AuthKit is loaded only here — never from route files.
 */
export function createDefaultAuthPort(): AuthPort {
  return {
    async getSessionIdentity() {
      const { headers } = await import('next/headers');
      const headerStore = await headers();
      const testUser = headerStore.get('x-kitsune-test-user');
      if (testUser && process.env.KITSUNE_ALLOW_TEST_USER_HEADER === '1') {
        const email =
          process.env.KITSUNE_DEMO_EMAIL?.trim() || `${testUser}@localhost`;
        return { externalId: testUser, email };
      }

      const { withAuth } = await import('@workos-inc/authkit-nextjs');
      const { user } = await withAuth();
      if (!user) return null;
      return {
        externalId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      };
    },
  };
}

let sharedAuthPort: AuthPort = createDefaultAuthPort();

export function setAuthPort(port: AuthPort): void {
  sharedAuthPort = port;
}

export function getAuthPort(): AuthPort {
  return sharedAuthPort;
}

/** Reset to the default WorkOS/test-header port (tests). */
export function resetAuthPort(): void {
  sharedAuthPort = createDefaultAuthPort();
}
