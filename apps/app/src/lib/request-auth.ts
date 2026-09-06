import { resolveApiKey, resolveOAuthAccessToken } from '@kitsuneos/core';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

export interface RequestAuth {
  workspaceId: string;
  principalId: string;
  scopes?: string[];
  authKind: 'session' | 'api_key' | 'oauth';
}

/**
 * Session cookie, API key, or OAuth access token.
 * Workspace is never taken from the client body.
 */
export async function resolveRequestAuth(
  request: Request,
): Promise<RequestAuth> {
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(authorization.indexOf(' ') + 1).trim();

    const oauth = await resolveOAuthAccessToken(engine.ownerPool, token);
    if (oauth) {
      return {
        workspaceId: oauth.workspaceId,
        principalId: oauth.principalId,
        scopes: oauth.scopes,
        authKind: 'oauth',
      };
    }

    try {
      const cred = await resolveApiKey(engine.ownerPool, token);
      return {
        workspaceId: cred.workspaceId,
        principalId: cred.principalId,
        authKind: 'api_key',
      };
    } catch {
      // fall through to a clearer error below if session also fails
    }
  }

  const session = await requireWorkspace();
  return {
    workspaceId: session.workspaceId,
    principalId: session.principalId,
    authKind: 'session',
  };
}
