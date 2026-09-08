// workspace-lint: ignore — MCP OAuth binds workspace from the authenticated
// session (requireWorkspace / token claims), never from client request params.
import {
  consentOriginMismatch,
  isConsentDecisionError,
  parseConsentDecisionBody,
  processConsentDecision,
} from '@kitsuneos/server';
import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import { publicAppOrigin } from '@/lib/public-origin';
import { requireWorkspace } from '@/lib/require-workspace';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readDecision(
  request: Request,
): Promise<{ decision: string; pendingId: string; csrfToken: string }> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await request.json()) as {
      decision?: string;
      pendingId?: string;
      csrfToken?: string;
    };
    return parseConsentDecisionBody(body);
  }
  const form = await request.formData();
  return parseConsentDecisionBody({
    decision: String(form.get('decision') ?? ''),
    pendingId: String(form.get('pendingId') ?? ''),
    csrfToken: String(form.get('csrfToken') ?? ''),
  });
}

/**
 * Consent decision endpoint. Approve issues the auth code; deny/expired never
 * touch mcp_oauth_codes. The pending row is deleted either way — single use.
 */
export async function POST(request: Request) {
  const { decision, pendingId, csrfToken } = await readDecision(request);

  if (consentOriginMismatch(request, publicAppOrigin(request))) {
    return NextResponse.json(
      {
        error: 'access_denied',
        error_description: 'Origin or Referer does not match this app.',
      },
      { status: 403 },
    );
  }

  const workspace = await requireWorkspace();
  const result = await processConsentDecision(engine, {
    decision,
    pendingId,
    csrfToken,
    workspaceId: workspace.workspaceId,
    principalId: workspace.principalId,
  });

  if (isConsentDecisionError(result)) {
    return NextResponse.json(
      {
        error: result.error,
        error_description: result.error_description,
      },
      { status: result.status },
    );
  }

  return NextResponse.redirect(result.redirectUrl);
}
