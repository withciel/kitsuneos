/**
 * Resolve the public site origin for OAuth/MCP metadata.
 * App Runner serves on 0.0.0.0:8080, so request.url.origin is wrong in prod.
 */
export function publicAppOrigin(request: Request): string {
  const fromEnv = process.env.APP_BASE_URL?.replace(/\/$/, '');
  if (fromEnv) {
    return fromEnv;
  }

  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (host && !host.startsWith('0.0.0.0') && host !== 'localhost') {
    return `${proto.split(',')[0]!.trim()}://${host.split(',')[0]!.trim()}`;
  }

  return new URL(request.url).origin;
}
