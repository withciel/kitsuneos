import { KitsuneError } from '@kitsuneos/core';
import { NextResponse } from 'next/server';

const CLIENT_CODES = new Set([
  'not_found',
  'forbidden',
  'validation',
  'conflict',
  'expired',
  'blocked',
]);

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  forbidden: 403,
  validation: 400,
  conflict: 409,
  expired: 409,
  blocked: 409,
  internal: 500,
};

/** Map known Kitsune errors to HTTP; hide unexpected internals. */
export function jsonError(error: unknown): NextResponse {
  if (error instanceof KitsuneError) {
    const status = STATUS_BY_CODE[error.code] ?? 400;
    const expose = CLIENT_CODES.has(error.code);
    return NextResponse.json(
      { error: expose ? error.message : 'Internal error' },
      { status },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes('Unauthorized') ||
    message.includes('Not authenticated')
  ) {
    return NextResponse.json({ error: message }, { status: 401 });
  }
  // Schema drift (e.g. missing principals.created_at before migrate) should not
  // look like a mysterious "Internal error" after Rotate key / Create agent.
  if (/column ["'].+["'] does not exist/i.test(message)) {
    console.error('Schema drift API error', error);
    return NextResponse.json(
      {
        error:
          'Database schema is out of date. Redeploy the app (or run migrate) and try again.',
      },
      { status: 503 },
    );
  }
  console.error('Unhandled API error', error);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}
