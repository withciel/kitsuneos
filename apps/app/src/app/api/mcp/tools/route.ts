import { handleMcpHttpRequest } from '@kitsuneos/server';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export async function GET(request: Request) {
  const result = await handleMcpHttpRequest(
    engine,
    'GET',
    '/mcp/tools',
    request.headers.get('authorization'),
    '',
  );
  return NextResponse.json(result.body, { status: result.status });
}
