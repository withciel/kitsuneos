// workspace-lint: ignore — MCP OAuth binds workspace from the authenticated
// session (requireWorkspace / token claims), never from client request params.
import { KitsuneError } from '@kitsuneos/core';
import {
  createMcpOAuthPendingConsent,
  isMcpOAuthClientError,
} from '@kitsuneos/server';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { publicAppOrigin } from '@/lib/public-origin';
import { requireWorkspace } from '@/lib/require-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authorization endpoint.
 * Signed-in workspace members grant MCP clients (auth code + PKCE).
 * Unauthenticated browsers are redirected through AuthKit login.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id') ?? '';
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const codeChallenge = url.searchParams.get('code_challenge') ?? '';
  const codeChallengeMethod =
    url.searchParams.get('code_challenge_method') ?? 'S256';
  const scope = url.searchParams.get('scope') ?? 'mcp:tools';
  const responseType = url.searchParams.get('response_type') ?? 'code';

  if (responseType !== 'code') {
    return NextResponse.json(
      { error: 'unsupported_response_type' },
      { status: 400 },
    );
  }
  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  let workspace: Awaited<ReturnType<typeof requireWorkspace>>;
  try {
    workspace = await requireWorkspace();
  } catch (err) {
    // Bounce unauthenticated browsers through AuthKit. Treat AuthKit middleware
    // gaps the same as Unauthorized so Claude handoff never gets a bare 500.
    const message = err instanceof Error ? err.message : String(err);
    const unauthorized =
      (err instanceof KitsuneError &&
        err.code === 'forbidden' &&
        err.message === 'Unauthorized') ||
      message === 'Unauthorized' ||
      /AuthKit middleware/i.test(message) ||
      /withAuth/i.test(message);
    if (!unauthorized) {
      console.error('mcp oauth authorize: workspace resolve failed', err);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }
    const login = new URL('/login', publicAppOrigin(request));
    login.searchParams.set('returnTo', `${url.pathname}${url.search}`);
    return NextResponse.redirect(login);
  }

  const result = await createMcpOAuthPendingConsent(engine, {
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
    state,
    workspaceId: workspace.workspaceId,
    principalId: workspace.principalId,
  });
  if (isMcpOAuthClientError(result)) {
    return NextResponse.json(
      {
        error: result.error,
        ...(result.error_description
          ? { error_description: result.error_description }
          : {}),
      },
      { status: result.status },
    );
  }

  const consent = new URL('/oauth/mcp/consent', publicAppOrigin(request));
  consent.searchParams.set('pending', result.pendingId);
  return NextResponse.redirect(consent);
}
