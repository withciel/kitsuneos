import { handleMcpHttpRequest } from '@kitsuneos/server';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

const DEPRECATION_HEADERS = {
  Deprecation: 'true',
  Sunset: 'Sat, 06 Mar 2027 00:00:00 GMT',
  Link: '</api/mcp>; rel="successor-version"',
  'X-Kitsune-MCP-Hint':
    'Legacy REST MCP helper. Prefer Streamable HTTP at /api/mcp.',
};

export async function GET(request: Request) {
  const result = await handleMcpHttpRequest(
    engine,
    'GET',
    '/mcp/tools',
    request.headers.get('authorization'),
    '',
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: DEPRECATION_HEADERS,
  });
}
