// workspace-lint: ignore — MCP OAuth binds workspace from the authenticated
// session (requireWorkspace / token claims), never from client request params.
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import {
  authCodeTtlSeconds,
  ensureMcpOAuthTables,
  newAuthCode,
} from '@/lib/mcp-oauth';
import { requireWorkspace } from '@/lib/require-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authorization endpoint.
 * Signed-in workspace members grant MCP clients (auth code + PKCE).
 * Unauthenticated browsers are redirected through AuthKit login.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id') ?? '';
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const codeChallenge = url.searchParams.get('code_challenge') ?? '';
  const codeChallengeMethod =
    url.searchParams.get('code_challenge_method') ?? 'S256';
  const scope = url.searchParams.get('scope') ?? 'mcp:tools';
  const responseType = url.searchParams.get('response_type') ?? 'code';

  if (responseType !== 'code') {
    return NextResponse.json(
      { error: 'unsupported_response_type' },
      { status: 400 },
    );
  }
  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (codeChallengeMethod !== 'S256') {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'S256 required' },
      { status: 400 },
    );
  }

  let workspace: Awaited<ReturnType<typeof requireWorkspace>>;
  try {
    workspace = await requireWorkspace();
  } catch {
    const login = new URL('/login', url.origin);
    login.searchParams.set('returnTo', `${url.pathname}${url.search}`);
    return NextResponse.redirect(login);
  }

  await ensureMcpOAuthTables(engine);
  const client = await engine.ownerPool.query<{
    client_id: string;
    client_name: string;
    redirect_uris: string[];
  }>(
    `SELECT client_id, client_name, redirect_uris
       FROM kitsune.mcp_oauth_clients WHERE client_id = $1`,
    [clientId],
  );
  const row = client.rows[0];
  if (!row) {
    return NextResponse.json({ error: 'invalid_client' }, { status: 400 });
  }
  if (!row.redirect_uris.includes(redirectUri)) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'redirect_uri mismatch' },
      { status: 400 },
    );
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
      clientId,
      workspace.workspaceId,
      workspace.principalId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      scope,
      expiresAt.toISOString(),
    ],
  );

  const redirect = new URL(redirectUri);
  redirect.searchParams.set('code', code);
  if (state) redirect.searchParams.set('state', state);
  return NextResponse.redirect(redirect);
}
