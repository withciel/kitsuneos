// workspace-lint: ignore — MCP OAuth binds workspace from the authenticated
// session (requireWorkspace / token claims), never from client request params.
import { exchangeMcpOAuthCode, isMcpOAuthClientError } from '@kitsuneos/server';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { mcpOAuthOptionsResponse, withMcpOAuthCors } from '@/lib/oauth-cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  let params: URLSearchParams;
  if (contentType.includes('application/json')) {
    const body = (await request.json()) as Record<string, string>;
    params = new URLSearchParams(body);
  } else {
    params = new URLSearchParams(await request.text());
  }

  if (params.get('grant_type') !== 'authorization_code') {
    return withMcpOAuthCors(
      request,
      NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 }),
    );
  }

  const result = await exchangeMcpOAuthCode(engine, {
    code: params.get('code') ?? '',
    redirectUri: params.get('redirect_uri') ?? '',
    clientId: params.get('client_id') ?? '',
    codeVerifier: params.get('code_verifier') ?? '',
    clientSecret: params.get('client_secret'),
  });

  if (isMcpOAuthClientError(result)) {
    return withMcpOAuthCors(
      request,
      NextResponse.json({ error: result.error }, { status: result.status }),
    );
  }

  return withMcpOAuthCors(request, NextResponse.json(result));
}

export async function OPTIONS(request: Request) {
  return mcpOAuthOptionsResponse(request);
}
