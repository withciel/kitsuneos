import { NextResponse } from 'next/server';
import { publicAppOrigin } from '@/lib/public-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 9728 Protected Resource Metadata for the MCP resource server. */
export async function GET(request: Request) {
  const origin = publicAppOrigin(request);
  const resource = `${origin}/api/mcp`;
  const authorizationServers = [origin];
  return NextResponse.json(
    {
      resource,
      authorization_servers: authorizationServers,
      scopes_supported: ['mcp:tools'],
      bearer_methods_supported: ['header'],
      resource_documentation: `${origin}/settings/connect`,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
