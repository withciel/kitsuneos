// workspace-lint: ignore — MCP OAuth binds workspace from the authenticated
// session (requireWorkspace / token claims), never from client request params.
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import {
  ensureMcpOAuthTables,
  hashClientSecret,
  mintMcpAccessToken,
  pkceChallengeS256,
} from '@/lib/mcp-oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  await ensureMcpOAuthTables(engine);

  const contentType = request.headers.get('content-type') ?? '';
  let params: URLSearchParams;
  if (contentType.includes('application/json')) {
    const body = (await request.json()) as Record<string, string>;
    params = new URLSearchParams(body);
  } else {
    params = new URLSearchParams(await request.text());
  }

  if (params.get('grant_type') !== 'authorization_code') {
    return NextResponse.json(
      { error: 'unsupported_grant_type' },
      { status: 400 },
    );
  }

  const code = params.get('code') ?? '';
  const redirectUri = params.get('redirect_uri') ?? '';
  const clientId = params.get('client_id') ?? '';
  const codeVerifier = params.get('code_verifier') ?? '';
  const clientSecret = params.get('client_secret');

  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const client = await engine.ownerPool.query<{
    client_id: string;
    client_secret_hash: string | null;
    token_endpoint_auth_method: string;
  }>(
    `SELECT client_id, client_secret_hash, token_endpoint_auth_method
       FROM kitsune.mcp_oauth_clients WHERE client_id = $1`,
    [clientId],
  );
  const clientRow = client.rows[0];
  if (!clientRow) {
    return NextResponse.json({ error: 'invalid_client' }, { status: 401 });
  }
  if (clientRow.token_endpoint_auth_method !== 'none') {
    if (
      !clientSecret ||
      !clientRow.client_secret_hash ||
      hashClientSecret(clientSecret) !== clientRow.client_secret_hash
    ) {
      return NextResponse.json({ error: 'invalid_client' }, { status: 401 });
    }
  }

  const codeRow = await engine.ownerPool.query<{
    code: string;
    client_id: string;
    workspace_id: string;
    principal_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    scope: string;
    expires_at: Date;
  }>(
    `DELETE FROM kitsune.mcp_oauth_codes
      WHERE code = $1
      RETURNING code, client_id, workspace_id, principal_id, redirect_uri,
                code_challenge, code_challenge_method, scope, expires_at`,
    [code],
  );
  const auth = codeRow.rows[0];
  if (!auth) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
  }
  if (auth.client_id !== clientId || auth.redirect_uri !== redirectUri) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
  }
  if (new Date(auth.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
  }
  if (auth.code_challenge_method !== 'S256') {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
  }
  if (pkceChallengeS256(codeVerifier) !== auth.code_challenge) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
  }

  const minted = mintMcpAccessToken({
    workspaceId: auth.workspace_id,
    principalId: auth.principal_id,
    clientId,
    scope: auth.scope,
  });

  return NextResponse.json({
    access_token: minted.accessToken,
    token_type: 'Bearer',
    expires_in: minted.expiresIn,
    scope: auth.scope,
  });
}
