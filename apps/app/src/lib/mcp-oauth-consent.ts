// workspace-lint: ignore — MCP OAuth binds workspace from the authenticated
// session, never from client request params.
import type { KitsuneEngine } from '@kitsuneos/core';
import {
  authCodeTtlSeconds,
  csrfTokensMatch,
  ensureMcpOAuthTables,
  newAuthCode,
} from './mcp-oauth';
import { publicAppOrigin } from './public-origin';

export interface PendingConsentRow {
  id: string;
  client_id: string;
  workspace_id: string;
  principal_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  state: string;
  csrf_token: string;
  expires_at: string;
}

export type ConsentDecisionError = {
  status: number;
  error: string;
  error_description: string;
};

export type ConsentDecisionOk = {
  redirectUrl: string;
  issuedCode: boolean;
};

/**
 * Reject cross-origin form posts when the browser sent Origin/Referer.
 * Best-effort defense-in-depth alongside the per-pending CSRF token —
 * absence of these headers is not itself an error (token check still applies).
 */
export function consentOriginMismatch(
  request: Request,
  expectedOrigin = publicAppOrigin(request),
): boolean {
  const expectedHost = new URL(expectedOrigin).host;
  for (const headerName of ['origin', 'referer']) {
    const value = request.headers.get(headerName);
    if (!value) continue;
    try {
      if (new URL(value).host !== expectedHost) return true;
    } catch {
      return true;
    }
  }
  return false;
}

export function parseConsentDecisionBody(input: {
  decision?: string;
  pendingId?: string;
  csrfToken?: string;
}): { decision: string; pendingId: string; csrfToken: string } {
  return {
    decision: input.decision ?? '',
    pendingId: input.pendingId ?? '',
    csrfToken: input.csrfToken ?? '',
  };
}

/**
 * Core consent decision after auth: consume pending row, mint auth code on
 * approve (when not expired), or redirect with access_denied on deny/expiry.
 * Ownership + CSRF are verified before DELETE so a forged request cannot
 * burn someone else's pending consent.
 */
export async function processConsentDecision(
  engine: KitsuneEngine,
  input: {
    decision: string;
    pendingId: string;
    csrfToken: string;
    workspaceId: string;
    principalId: string;
  },
): Promise<ConsentDecisionOk | ConsentDecisionError> {
  const { decision, pendingId, csrfToken, workspaceId, principalId } = input;

  if (!pendingId || (decision !== 'approve' && decision !== 'deny')) {
    return {
      status: 400,
      error: 'invalid_request',
      error_description: 'decision and pendingId are required.',
    };
  }

  await ensureMcpOAuthTables(engine);

  const pendingResult = await engine.ownerPool.query<PendingConsentRow>(
    `SELECT id, client_id, workspace_id, principal_id, redirect_uri,
            code_challenge, code_challenge_method, scope, state, csrf_token,
            expires_at
       FROM kitsune.mcp_oauth_pending
      WHERE id = $1`,
    [pendingId],
  );
  const pending = pendingResult.rows[0];
  if (!pending) {
    return {
      status: 400,
      error: 'invalid_request',
      error_description: 'Unknown or already-used consent request.',
    };
  }
  if (
    pending.workspace_id !== workspaceId ||
    pending.principal_id !== principalId
  ) {
    return {
      status: 403,
      error: 'access_denied',
      error_description: 'Signed-in account does not match this request.',
    };
  }
  if (!csrfTokensMatch(csrfToken, pending.csrf_token)) {
    return {
      status: 403,
      error: 'invalid_request',
      error_description: 'Missing or invalid CSRF token.',
    };
  }

  const deleteResult = await engine.ownerPool.query(
    `DELETE FROM kitsune.mcp_oauth_pending
      WHERE id = $1 AND workspace_id = $2 AND principal_id = $3
      RETURNING id`,
    [pendingId, workspaceId, principalId],
  );
  if (deleteResult.rowCount === 0) {
    return {
      status: 400,
      error: 'invalid_request',
      error_description: 'Unknown or already-used consent request.',
    };
  }

  const redirect = new URL(pending.redirect_uri);
  if (pending.state) redirect.searchParams.set('state', pending.state);

  if (
    decision === 'deny' ||
    new Date(pending.expires_at).getTime() < Date.now()
  ) {
    redirect.searchParams.set('error', 'access_denied');
    return { redirectUrl: redirect.toString(), issuedCode: false };
  }

  const code = newAuthCode();
  const expiresAt = new Date(Date.now() + authCodeTtlSeconds() * 1000);
  await engine.ownerPool.query(
    `INSERT INTO kitsune.mcp_oauth_codes
       (code, client_id, workspace_id, principal_id, redirect_uri,
        code_challenge, code_challenge_method, scope, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      code,
      pending.client_id,
      pending.workspace_id,
      pending.principal_id,
      pending.redirect_uri,
      pending.code_challenge,
      pending.code_challenge_method,
      pending.scope,
      expiresAt.toISOString(),
    ],
  );

  redirect.searchParams.set('code', code);
  return { redirectUrl: redirect.toString(), issuedCode: true };
}

export function isConsentDecisionError(
  result: ConsentDecisionOk | ConsentDecisionError,
): result is ConsentDecisionError {
  return 'status' in result;
}
