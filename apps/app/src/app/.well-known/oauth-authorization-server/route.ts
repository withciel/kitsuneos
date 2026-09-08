import { mcpOAuthAuthorizationServerMetadata } from '@kitsuneos/server';
import { NextResponse } from 'next/server';
import { mcpOAuthCorsHeaders } from '@/lib/oauth-cors';
import { publicAppOrigin } from '@/lib/public-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** RFC 8414 Authorization Server Metadata for the embedded MCP AS. */
export async function GET(request: Request) {
  const issuer = publicAppOrigin(request);
  return NextResponse.json(mcpOAuthAuthorizationServerMetadata(issuer), {
    headers: {
      'Cache-Control': 'public, max-age=60',
      ...mcpOAuthCorsHeaders(request),
    },
  });
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: mcpOAuthCorsHeaders(request),
  });
}
