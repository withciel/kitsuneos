import { handleStreamableMcpRequest } from '@kitsuneos/server';
import { engine } from '@/lib/engine';
import { resolveMcpOAuthCredential } from '@/lib/mcp-oauth';
import { publicAppOrigin } from '@/lib/public-origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function resourceMetadataUrl(request: Request): string {
  // Prefer path-appended PRM (RFC 9728) so clients resolving /api/mcp find JSON
  // instead of the Next.js HTML 404 at the unscoped well-known path alone.
  return `${publicAppOrigin(request)}/.well-known/oauth-protected-resource/api/mcp`;
}

function allowedOriginsFromEnv(): string[] {
  const raw = process.env.KITSUNE_MCP_ALLOWED_ORIGINS ?? '';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function handle(request: Request): Promise<Response> {
  return handleStreamableMcpRequest(engine, request, {
    allowedOrigins: allowedOriginsFromEnv(),
    resourceMetadataUrl: resourceMetadataUrl(request),
    resolveOAuthCredential: (token) => resolveMcpOAuthCredential(engine, token),
  });
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handle(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handle(request);
}
