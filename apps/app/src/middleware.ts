import { authkitMiddleware } from '@workos-inc/authkit-nextjs';
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from 'next/server';

const authkit = authkitMiddleware();

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (process.env.KITSUNE_LOCAL_DEMO === '1') {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(
      'x-kitsune-test-user',
      process.env.KITSUNE_DEMO_WORKOS_ID ?? 'local-demo-user',
    );
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  return authkit(request, event);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|health|api/mcp|api/billing/webhook).*)',
  ],
};
