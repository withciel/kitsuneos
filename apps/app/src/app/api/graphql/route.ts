import { handleGraphqlHttp, httpAuthError } from '@kitsuneos/graphql';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { resolveRequestAuth } from '@/lib/request-auth';

export async function POST(request: Request) {
  try {
    const ctx = await resolveRequestAuth(request);
    const raw = await request.text();
    const result = await handleGraphqlHttp(
      engine,
      ctx,
      raw,
      'http://localhost/api/graphql',
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const failed = httpAuthError(error);
    return NextResponse.json(failed.body, { status: failed.status });
  }
}
