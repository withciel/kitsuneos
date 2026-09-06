import type { KitsuneEngine } from '@kitsuneos/core';
import { KitsuneError, recordUsageEvent } from '@kitsuneos/core';
import { createKitsuneMcpServer } from '@kitsuneos/mcp';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { checkRateLimit } from './rate-limit.js';
import type { CredentialContext } from './resolve-credential.js';
import { auditAuthFailure, resolveCredential } from './resolve-credential.js';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://claude.ai',
  'https://claude.com',
  'https://cursor.com',
  'https://www.cursor.com',
  'https://chatgpt.com',
  'https://chat.openai.com',
  'https://grok.x.ai',
  'https://x.com',
];

export interface StreamableMcpOptions {
  allowedOrigins?: string[];
  resourceMetadataUrl?: string;
  resolveOAuthCredential?: (token: string) => Promise<CredentialContext | null>;
}

function unauthorizedResponse(resourceMetadataUrl?: string): Response {
  const params = ['Bearer realm="kitsuneos"', 'scope="mcp:tools"'];
  if (resourceMetadataUrl) {
    params.push(`resource_metadata="${resourceMetadataUrl}"`);
  }
  return new Response(
    JSON.stringify({
      error: 'unauthorized',
      message: 'Bearer API key or OAuth access token required',
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': params.join(', '),
      },
    },
  );
}

function extractBearer(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token.length > 0 ? token : null;
}

async function resolveMcpCredential(
  engine: KitsuneEngine,
  authorization: string | null,
  options: StreamableMcpOptions,
): Promise<CredentialContext | Response> {
  const token = extractBearer(authorization);
  if (!token) {
    await auditAuthFailure(
      engine,
      authorization ?? undefined,
      'missing bearer',
    );
    return unauthorizedResponse(options.resourceMetadataUrl);
  }

  if (options.resolveOAuthCredential) {
    const oauth = await options.resolveOAuthCredential(token);
    if (oauth) return oauth;
  }

  try {
    return await resolveCredential(engine, `Bearer ${token}`);
  } catch (error) {
    await auditAuthFailure(
      engine,
      authorization ?? undefined,
      error instanceof KitsuneError ? error.message : 'auth failed',
    );
    return unauthorizedResponse(options.resourceMetadataUrl);
  }
}

/**
 * Streamable HTTP MCP endpoint (Web Standards Request/Response).
 * Stateless JSON mode — fresh transport + server per request.
 */
export async function handleStreamableMcpRequest(
  engine: KitsuneEngine,
  request: Request,
  options: StreamableMcpOptions = {},
): Promise<Response> {
  const allowedOrigins = [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(options.allowedOrigins ?? []),
  ];
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins.includes(origin)) {
    // Allow same-site app origin dynamically via Host header match.
    try {
      const host = request.headers.get('host');
      const originUrl = new URL(origin);
      if (!host || originUrl.host !== host) {
        return new Response(
          JSON.stringify({
            error: 'forbidden',
            message: 'Origin not allowed',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }
    } catch {
      return new Response(
        JSON.stringify({ error: 'forbidden', message: 'Origin not allowed' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin ?? '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers':
          'Authorization, Content-Type, Accept, MCP-Session-Id, MCP-Protocol-Version, Last-Event-ID',
        'Access-Control-Expose-Headers': 'MCP-Session-Id, MCP-Protocol-Version',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const credentialOrResponse = await resolveMcpCredential(
    engine,
    request.headers.get('authorization'),
    options,
  );
  if (credentialOrResponse instanceof Response) {
    return credentialOrResponse;
  }
  const credential = credentialOrResponse;

  if (!checkRateLimit(credential.keyId)) {
    return new Response(
      JSON.stringify({
        error: 'rate_limited',
        message: 'Too many requests',
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createKitsuneMcpServer({
    engine,
    getContext: () => ({
      workspaceId: credential.workspaceId,
      principalId: credential.principalId,
    }),
  });

  await server.connect(transport);

  try {
    const response = await transport.handleRequest(request);
    if (request.method === 'POST') {
      void recordUsageEvent(
        engine.ownerPool,
        credential.workspaceId,
        'mcp_streamable',
      ).catch(() => {});
    }
    if (origin) {
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set(
        'Access-Control-Expose-Headers',
        'MCP-Session-Id, MCP-Protocol-Version',
      );
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    return response;
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
