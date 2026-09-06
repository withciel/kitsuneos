import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 9728 Protected Resource Metadata for the MCP resource server. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const resource = `${url.origin}/api/mcp`;
  const authorizationServers = [`${url.origin}`];
  return NextResponse.json(
    {
      resource,
      authorization_servers: authorizationServers,
      scopes_supported: ['mcp:tools'],
      bearer_methods_supported: ['header'],
      resource_documentation: `${url.origin}/settings/connect`,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
