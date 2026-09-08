import type { WorkspaceRole } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

export type RequestAuthKind = 'session' | 'api_key' | 'oauth';

/**
 * Unified console HTTP auth result.
 *
 * Session cookie / test header → authKind session (via AuthPort + requireWorkspace).
 * Bearer API key / OAuth access token → authKind api_key | oauth (via engine methods).
 *
 * Session-only fields (userId, email, role, names) are set only for session.
 * Workspace is never taken from the client body.
 *
 * Prefer resolveRequestAuth for dual-mode API routes; requireWorkspace for
 * session-only surfaces (billing checkout, people admin, etc.).
 */
export interface RequestAuth {
  workspaceId: string;
  principalId: string;
  scopes?: string[];
  authKind: RequestAuthKind;
  userId?: string;
  email?: string;
  role?: WorkspaceRole;
  firstName?: string | null;
  lastName?: string | null;
}

export async function resolveRequestAuth(
  request: Request,
): Promise<RequestAuth> {
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(authorization.indexOf(' ') + 1).trim();

    const oauth = await engine.resolveOAuthAccessToken(token);
    if (oauth) {
      return {
        workspaceId: oauth.workspaceId,
        principalId: oauth.principalId,
        scopes: oauth.scopes,
        authKind: 'oauth',
      };
    }

    try {
      const cred = await engine.resolveApiKey(token);
      return {
        workspaceId: cred.workspaceId,
        principalId: cred.principalId,
        authKind: 'api_key',
      };
    } catch (error) {
      if (
        error instanceof KitsuneError &&
        error.code === 'forbidden' &&
        error.message === 'Invalid API key'
      ) {
        // Fall through to session so a non-key bearer does not mask cookie auth.
      } else {
        throw error;
      }
    }
  }

  const session = await requireWorkspace();
  return {
    workspaceId: session.workspaceId,
    principalId: session.principalId,
    authKind: 'session',
    userId: session.userId,
    email: session.email,
    role: session.role,
    firstName: session.firstName,
    lastName: session.lastName,
  };
}
