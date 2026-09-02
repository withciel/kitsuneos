import { handleMcpHttpRequest } from '@kitsuneos/server';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export async function POST(request: Request) {
  const raw = await request.text();
  const result = await handleMcpHttpRequest(
    engine,
    'POST',
    '/mcp/tools/call',
    request.headers.get('authorization'),
    raw,
  );
  return NextResponse.json(result.body, { status: result.status });
}
