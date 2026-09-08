import {
  isMcpOAuthClientError,
  registerMcpOAuthClient,
} from '@kitsuneos/server';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { mcpOAuthOptionsResponse, withMcpOAuthCors } from '@/lib/oauth-cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** OAuth 2.0 Dynamic Client Registration (RFC 7591) for MCP clients. */
export async function POST(request: Request) {
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

  const result = await registerMcpOAuthClient(engine, body);
  if (isMcpOAuthClientError(result)) {
    return withMcpOAuthCors(
      request,
      NextResponse.json({ error: result.error }, { status: result.status }),
    );
  }

  return withMcpOAuthCors(request, NextResponse.json(result, { status: 201 }));
}

export async function OPTIONS(request: Request) {
  return mcpOAuthOptionsResponse(request);
}
