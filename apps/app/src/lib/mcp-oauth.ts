// workspace-lint: ignore — MCP OAuth binds workspace from the authenticated
// session (requireWorkspace / token claims), never from client request params.
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { type KitsuneEngine, schemaNameForWorkspace } from '@kitsuneos/core';
import type { CredentialContext } from '@kitsuneos/server';

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const AUTH_CODE_TTL_SECONDS = 10 * 60;

function oauthSecret(): string {
  const secret =
    process.env.KITSUNE_MCP_OAUTH_SECRET ||
    process.env.WORKOS_COOKIE_PASSWORD ||
    process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      'Set KITSUNE_MCP_OAUTH_SECRET (or WORKOS_COOKIE_PASSWORD) for MCP OAuth',
    );
  }
  return secret;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url').replace(/=+$/g, '');
}

function sign(payload: string): string {
  return createHmac('sha256', oauthSecret())
    .update(payload)
    .digest('base64url');
}

export interface McpAccessTokenClaims {
  workspaceId: string;
  principalId: string;
  clientId: string;
  scope: string;
  exp: number;
  iat: number;
  jti: string;
}

export function mintMcpAccessToken(
  claims: Omit<McpAccessTokenClaims, 'iat' | 'jti' | 'exp'> & {
    expiresInSeconds?: number;
  },
): { accessToken: string; expiresIn: number; claims: McpAccessTokenClaims } {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = claims.expiresInSeconds ?? ACCESS_TOKEN_TTL_SECONDS;
  const full: McpAccessTokenClaims = {
    workspaceId: claims.workspaceId,
    principalId: claims.principalId,
    clientId: claims.clientId,
    scope: claims.scope,
    iat: now,
    exp: now + expiresIn,
    jti: randomBytes(16).toString('hex'),
  };
  const body = b64url(JSON.stringify(full));
  return {
    accessToken: `mcp_${body}.${sign(body)}`,
    expiresIn,
    claims: full,
  };
}

export function verifyMcpAccessToken(
  token: string,
): McpAccessTokenClaims | null {
  if (!token.startsWith('mcp_')) return null;
  const raw = token.slice('mcp_'.length);
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as McpAccessTokenClaims;
    if (claims.exp * 1000 < Date.now()) return null;
    if (!claims.workspaceId || !claims.principalId) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function resolveMcpOAuthCredential(
  _engine: KitsuneEngine,
  token: string,
): Promise<CredentialContext | null> {
  if (token.startsWith('kso_live_') || token.startsWith('kso_test_')) {
    return null;
  }
  const claims = verifyMcpAccessToken(token);
  if (!claims) return null;
  return {
    keyId: `oauth:${claims.jti}`,
    keyPrefix: 'mcp_oauth',
    principalId: claims.principalId,
    workspaceId: claims.workspaceId,
    schemaName: schemaNameForWorkspace(claims.workspaceId),
  };
}

export function pkceChallengeS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function newAuthCode(): string {
  return randomBytes(24).toString('base64url');
}

export function newClientSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashClientSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function authCodeTtlSeconds(): number {
  return AUTH_CODE_TTL_SECONDS;
}

export async function ensureMcpOAuthTables(
  engine: KitsuneEngine,
): Promise<void> {
  await engine.ownerPool.query(`
    CREATE TABLE IF NOT EXISTS kitsune.mcp_oauth_clients (
      client_id text PRIMARY KEY,
      client_secret_hash text,
      client_name text NOT NULL,
      redirect_uris text[] NOT NULL,
      token_endpoint_auth_method text NOT NULL DEFAULT 'none',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS kitsune.mcp_oauth_codes (
      code text PRIMARY KEY,
      client_id text NOT NULL REFERENCES kitsune.mcp_oauth_clients(client_id) ON DELETE CASCADE,
      workspace_id uuid NOT NULL,
      principal_id uuid NOT NULL,
      redirect_uri text NOT NULL,
      code_challenge text NOT NULL,
      code_challenge_method text NOT NULL,
      scope text NOT NULL DEFAULT 'mcp:tools',
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}
