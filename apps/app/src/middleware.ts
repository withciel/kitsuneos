import { authkitMiddleware } from '@workos-inc/authkit-nextjs';
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from 'next/server';

// authkit-nextjs reads NEXT_PUBLIC_WORKOS_REDIRECT_URI (not WORKOS_REDIRECT_URI).
// Edge middleware also inlines env at build time, so pass an explicit URI.
// Hosted: require an explicit redirect URI (no hardcoded production host fallback).
// Local demo: authkit is not invoked; a localhost placeholder satisfies construction.
const configuredRedirectUri =
  process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ||
  process.env.WORKOS_REDIRECT_URI;

if (!configuredRedirectUri && process.env.KITSUNE_LOCAL_DEMO !== '1') {
  throw new Error(
    'Set NEXT_PUBLIC_WORKOS_REDIRECT_URI (or WORKOS_REDIRECT_URI) for hosted auth, or KITSUNE_LOCAL_DEMO=1 for local eval',
  );
}

const redirectUri = configuredRedirectUri ?? 'http://localhost:3000/callback';

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
      // Authorize must run through AuthKit middleware (session for withAuth)
      // but stay anonymous so Claude's browser handoff is not blocked.
      '/api/mcp/oauth/authorize',
      // Consent POST also needs AuthKit middleware to run (session for
      // withAuth/requireWorkspace) — see matcher below. It enforces its own
      // auth via requireWorkspace(), so it does not need to be unauthenticated
      // here, but the matcher exclusion for /api/mcp must not swallow it.
      '/api/mcp/oauth/token',
      '/api/mcp/oauth/register',
      // MCP OAuth discovery must be anonymous (RFC 8414 / 9728).
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-protected-resource',
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
    // Skip static assets, health, MCP transport (not oauth/authorize or
    // oauth/consent), billing webhooks, and RFC 8414/9728 discovery.
    // Authorize and consent are intentionally NOT skipped — withAuth
    // requires AuthKit middleware to have run on those paths.
    '/((?!_next/static|_next/image|favicon.ico|health|api/mcp(?!/oauth/(?:authorize|consent))|api/billing/webhook|\\.well-known).*)',
  ],
};
