import { resolveApiKey } from '@kitsuneos/core';
import { engine } from '@/lib/engine';
import { requireWorkspace } from '@/lib/require-workspace';

export interface RequestAuth {
  workspaceId: string;
  principalId: string;
}

/** Session cookie or API key. Workspace is never taken from the client body. */
export async function resolveRequestAuth(
  request: Request,
): Promise<RequestAuth> {
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(authorization.indexOf(' ') + 1).trim();
    const cred = await resolveApiKey(engine.ownerPool, token);
    return {
      workspaceId: cred.workspaceId,
      principalId: cred.principalId,
    };
  }
  const session = await requireWorkspace();
  return {
    workspaceId: session.workspaceId,
    principalId: session.principalId,
  };
}
