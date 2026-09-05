import { authkitMiddleware } from '@workos-inc/authkit-nextjs';
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from 'next/server';

// authkit-nextjs reads NEXT_PUBLIC_WORKOS_REDIRECT_URI (not WORKOS_REDIRECT_URI).
// Edge middleware also inlines env at build time, so pass an explicit URI.
const redirectUri =
  process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ||
  process.env.WORKOS_REDIRECT_URI ||
  `${originFromAppHost()}/callback`;

function originFromAppHost(): string {
  const host = process.env.NEXT_PUBLIC_APP_HOST ?? 'app.kitsuneos.com';
  return `https://${host}`;
}

const authkit = authkitMiddleware({
  redirectUri,
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      '/login',
      '/signup',
      '/callback',
      '/health',
      '/api/billing/webhook',
      '/api/mcp/tools/call',
      '/api/mcp/tools',
    ],
  },
  signUpPaths: ['/signup'],
});

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
