/** CORS headers for MCP OAuth discovery / DCR / token (browser + connector clients). */

const ALLOWED_ORIGIN_SUFFIXES = [
  'claude.ai',
  'claude.com',
  'cursor.com',
  'cursor.sh',
  'chatgpt.com',
  'openai.com',
  'x.ai',
  'x.com',
];

export function mcpOAuthCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  let allowOrigin = '*';
  if (origin) {
    try {
      const host = new URL(origin).hostname;
      const allowed = ALLOWED_ORIGIN_SUFFIXES.some(
        (suffix) => host === suffix || host.endsWith(`.${suffix}`),
      );
      allowOrigin = allowed ? origin : '*';
    } catch {
      allowOrigin = '*';
    }
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, Accept, MCP-Protocol-Version',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function withMcpOAuthCors(
  request: Request,
  response: Response,
): Response {
  const headers = new Headers(response.headers);
  const cors = mcpOAuthCorsHeaders(request);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function mcpOAuthOptionsResponse(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: mcpOAuthCorsHeaders(request),
  });
}
