import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import {
  ensureMcpOAuthTables,
  hashClientSecret,
  newClientSecret,
} from '@/lib/mcp-oauth';
import { mcpOAuthOptionsResponse, withMcpOAuthCors } from '@/lib/oauth-cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** OAuth 2.0 Dynamic Client Registration (RFC 7591) for MCP clients. */
export async function POST(request: Request) {
  await ensureMcpOAuthTables(engine);
  let body: {
    client_name?: string;
    redirect_uris?: string[];
    token_endpoint_auth_method?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return withMcpOAuthCors(
      request,
      NextResponse.json({ error: 'invalid_client_metadata' }, { status: 400 }),
    );
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u) => typeof u === 'string' && u.length > 0)
    : [];
  if (redirectUris.length === 0) {
    return withMcpOAuthCors(
      request,
      NextResponse.json({ error: 'invalid_redirect_uri' }, { status: 400 }),
    );
  }

  const clientId = `mcp_cli_${crypto.randomUUID().replace(/-/g, '')}`;
  const authMethod = body.token_endpoint_auth_method ?? 'none';
  const clientSecret = authMethod === 'none' ? null : newClientSecret();
  const clientName =
    typeof body.client_name === 'string' && body.client_name.trim()
      ? body.client_name.trim()
      : 'MCP client';

  await engine.ownerPool.query(
    `INSERT INTO kitsune.mcp_oauth_clients
       (client_id, client_secret_hash, client_name, redirect_uris, token_endpoint_auth_method)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      clientId,
      clientSecret ? hashClientSecret(clientSecret) : null,
      clientName,
      redirectUris,
      authMethod,
    ],
  );

  return withMcpOAuthCors(
    request,
    NextResponse.json(
      {
        client_id: clientId,
        client_secret: clientSecret ?? undefined,
        client_name: clientName,
        redirect_uris: redirectUris,
        token_endpoint_auth_method: authMethod,
        grant_types: ['authorization_code'],
        response_types: ['code'],
        scope: 'mcp:tools',
      },
      { status: 201 },
    ),
  );
}

export async function OPTIONS(request: Request) {
  return mcpOAuthOptionsResponse(request);
}
