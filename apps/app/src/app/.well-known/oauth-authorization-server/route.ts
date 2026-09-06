import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 8414 Authorization Server Metadata for the embedded MCP AS. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const issuer = url.origin;
  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/api/mcp/oauth/authorize`,
      token_endpoint: `${issuer}/api/mcp/oauth/token`,
      registration_endpoint: `${issuer}/api/mcp/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      scopes_supported: ['mcp:tools'],
      service_documentation: `${issuer}/settings/connect`,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
