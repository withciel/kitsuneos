import { handleMcpHttpRequest } from '@kitsuneos/server';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export async function GET() {
  const result = await handleMcpHttpRequest(engine, 'GET', '/health', null, '');
  return NextResponse.json(result.body, { status: result.status });
}
