import { handleRestRecordGet, httpAuthError } from '@kitsuneos/graphql';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { resolveRequestAuth } from '@/lib/request-auth';

const NOT_FOUND = { error: 'Not found' } as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ collection: string; id: string }> },
) {
  try {
    const ctx = await resolveRequestAuth(request);
    const { collection, id } = await context.params;
    const result = await handleRestRecordGet(engine, ctx, collection, id);
    if (result.status === 404) {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const failed = httpAuthError(error);
    if (failed.status === 401) {
      return NextResponse.json(failed.body, { status: 401 });
    }
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }
}
