import { NextResponse } from 'next/server';
import { mcpOAuthCorsHeaders } from '@/lib/oauth-cors';
import { publicAppOrigin } from '@/lib/public-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * RFC 9728 path-appended Protected Resource Metadata.
 * Clients resolving resource https://host/api/mcp look here first:
 * /.well-known/oauth-protected-resource/api/mcp
 */
export async function GET(request: Request) {
  const origin = publicAppOrigin(request);
  const resource = `${origin}/api/mcp`;
  return NextResponse.json(
    {
      resource,
      authorization_servers: [origin],
      scopes_supported: ['mcp:tools'],
      bearer_methods_supported: ['header'],
      resource_documentation: `${origin}/settings/connect`,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60',
        ...mcpOAuthCorsHeaders(request),
      },
    },
  );
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: mcpOAuthCorsHeaders(request),
  });
}
