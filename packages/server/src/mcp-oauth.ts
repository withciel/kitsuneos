/**
 * MCP OAuth authorization server (HMAC access tokens + PKCE auth codes).
 * SQL stays inside this module; Next route adapters must not touch ownerPool.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { type KitsuneEngine, schemaNameForWorkspace } from '@kitsuneos/core';
import type { CredentialContext } from './resolve-credential.js';

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const AUTH_CODE_TTL_SECONDS = 10 * 60;
const PENDING_CONSENT_TTL_SECONDS = 10 * 60;

/** Optional overrides for tests (clock + HMAC secret). */
export interface McpOAuthDeps {
  nowMs?: () => number;
  secret?: string;
}

function nowSeconds(deps?: McpOAuthDeps): number {
  return Math.floor((deps?.nowMs?.() ?? Date.now()) / 1000);
}

function oauthSecret(deps?: McpOAuthDeps): string {
  const secret =
    deps?.secret ||
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

function sign(payload: string, deps?: McpOAuthDeps): string {
  return createHmac('sha256', oauthSecret(deps))
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
  deps?: McpOAuthDeps,
): { accessToken: string; expiresIn: number; claims: McpAccessTokenClaims } {
  const now = nowSeconds(deps);
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
    accessToken: `mcp_${body}.${sign(body, deps)}`,
    expiresIn,
    claims: full,
  };
}

export function verifyMcpAccessToken(
  token: string,
  deps?: McpOAuthDeps,
): McpAccessTokenClaims | null {
  if (!token.startsWith('mcp_')) return null;
  const raw = token.slice('mcp_'.length);
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  const expected = sign(body, deps);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as McpAccessTokenClaims;
    const nowMs = deps?.nowMs?.() ?? Date.now();
    if (claims.exp * 1000 < nowMs) return null;
    if (!claims.workspaceId || !claims.principalId) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function resolveMcpOAuthCredential(
  _engine: KitsuneEngine,
  token: string,
  deps?: McpOAuthDeps,
): Promise<CredentialContext | null> {
  if (token.startsWith('kso_live_') || token.startsWith('kso_test_')) {
    return null;
  }
  const claims = verifyMcpAccessToken(token, deps);
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

/** Opaque id for a pending consent row (not a credential — no scope on its own). */
export function newPendingConsentId(): string {
  return randomBytes(24).toString('base64url');
}

export function pendingConsentTtlSeconds(): number {
  return PENDING_CONSENT_TTL_SECONDS;
}

/**
 * Single-use CSRF token bound to one pending consent row. Random 32+ bytes,
 * plaintext-in-DB is acceptable because it is scoped to a short-lived,
 * single-use row (same trust model as the auth code itself).
 */
export function newCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Constant-time comparison so token checks don't leak timing info. */
export function csrfTokensMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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

export interface McpOAuthAuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  scopes_supported: string[];
  service_documentation: string;
}

/** RFC 8414 Authorization Server Metadata for the embedded MCP AS. */
export function mcpOAuthAuthorizationServerMetadata(
  issuer: string,
): McpOAuthAuthorizationServerMetadata {
  const base = issuer.replace(/\/$/, '');
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/mcp/oauth/authorize`,
    token_endpoint: `${base}/api/mcp/oauth/token`,
    registration_endpoint: `${base}/api/mcp/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: ['mcp:tools'],
    service_documentation: `${base}/settings/connect`,
  };
}

export type McpOAuthClientError = {
  error: string;
  error_description?: string;
  status: number;
};

export interface RegisteredMcpOAuthClient {
  client_id: string;
  client_secret?: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: string;
  grant_types: string[];
  response_types: string[];
  scope: string;
}

/** OAuth 2.0 Dynamic Client Registration (RFC 7591). */
export async function registerMcpOAuthClient(
  engine: KitsuneEngine,
  input: {
    client_name?: string;
    redirect_uris?: string[];
    token_endpoint_auth_method?: string;
  },
): Promise<RegisteredMcpOAuthClient | McpOAuthClientError> {
  const redirectUris = Array.isArray(input.redirect_uris)
    ? input.redirect_uris.filter((u) => typeof u === 'string' && u.length > 0)
    : [];
  if (redirectUris.length === 0) {
    return { error: 'invalid_redirect_uri', status: 400 };
  }

  const clientId = `mcp_cli_${crypto.randomUUID().replace(/-/g, '')}`;
  const authMethod = input.token_endpoint_auth_method ?? 'none';
  const clientSecret = authMethod === 'none' ? null : newClientSecret();
  const clientName =
    typeof input.client_name === 'string' && input.client_name.trim()
      ? input.client_name.trim()
      : 'MCP client';

  await engine.ownerPool.query(
    `INSERT INTO kitsune.mcp_oauth_clients
       (client_id, client_secret_hash, client_name, redirect_uris, token_endpoint_auth_method)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      clientId,
      clientSecret ? hashClientSecret(clientSecret) : null,
      clientName,
      redirectUris,
      authMethod,
    ],
  );

  return {
    client_id: clientId,
    client_secret: clientSecret ?? undefined,
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: authMethod,
    grant_types: ['authorization_code'],
    response_types: ['code'],
    scope: 'mcp:tools',
  };
}

export type CreatePendingConsentResult =
  | { pendingId: string }
  | McpOAuthClientError;

/**
 * Validate client + redirect_uri and insert a short-lived pending consent row.
 * Does not mint an auth code — Approve/Deny happens on the consent step.
 */
export async function createMcpOAuthPendingConsent(
  engine: KitsuneEngine,
  input: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    scope: string;
    state: string;
    workspaceId: string;
    principalId: string;
  },
  deps?: McpOAuthDeps,
): Promise<CreatePendingConsentResult> {
  if (input.codeChallengeMethod !== 'S256') {
    return {
      error: 'invalid_request',
      error_description: 'S256 required',
      status: 400,
    };
  }

  const client = await engine.ownerPool.query<{
    client_id: string;
    client_name: string;
    redirect_uris: string[];
  }>(
    `SELECT client_id, client_name, redirect_uris
       FROM kitsune.mcp_oauth_clients WHERE client_id = $1`,
    [input.clientId],
  );
  const row = client.rows[0];
  if (!row) {
    return { error: 'invalid_client', status: 400 };
  }
  if (!row.redirect_uris.includes(input.redirectUri)) {
    return {
      error: 'invalid_request',
      error_description: 'redirect_uri mismatch',
      status: 400,
    };
  }

  const pendingId = newPendingConsentId();
  const csrfToken = newCsrfToken();
  const nowMs = deps?.nowMs?.() ?? Date.now();
  const expiresAt = new Date(nowMs + pendingConsentTtlSeconds() * 1000);
  await engine.ownerPool.query(
    `INSERT INTO kitsune.mcp_oauth_pending
       (id, client_id, workspace_id, principal_id, redirect_uri,
        code_challenge, code_challenge_method, scope, state, csrf_token, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      pendingId,
      input.clientId,
      input.workspaceId,
      input.principalId,
      input.redirectUri,
      input.codeChallenge,
      input.codeChallengeMethod,
      input.scope,
      input.state,
      csrfToken,
      expiresAt.toISOString(),
    ],
  );

  return { pendingId };
}

export type ExchangeMcpOAuthCodeResult =
  | {
      access_token: string;
      token_type: 'Bearer';
      expires_in: number;
      scope: string;
    }
  | McpOAuthClientError;

/** Authorization-code + PKCE token exchange. */
export async function exchangeMcpOAuthCode(
  engine: KitsuneEngine,
  input: {
    code: string;
    redirectUri: string;
    clientId: string;
    codeVerifier: string;
    clientSecret?: string | null;
  },
  deps?: McpOAuthDeps,
): Promise<ExchangeMcpOAuthCodeResult> {
  const { code, redirectUri, clientId, codeVerifier, clientSecret } = input;
  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return { error: 'invalid_request', status: 400 };
  }

  const client = await engine.ownerPool.query<{
    client_id: string;
    client_secret_hash: string | null;
    token_endpoint_auth_method: string;
  }>(
    `SELECT client_id, client_secret_hash, token_endpoint_auth_method
       FROM kitsune.mcp_oauth_clients WHERE client_id = $1`,
    [clientId],
  );
  const clientRow = client.rows[0];
  if (!clientRow) {
    return { error: 'invalid_client', status: 401 };
  }
  if (clientRow.token_endpoint_auth_method !== 'none') {
    if (
      !clientSecret ||
      !clientRow.client_secret_hash ||
      hashClientSecret(clientSecret) !== clientRow.client_secret_hash
    ) {
      return { error: 'invalid_client', status: 401 };
    }
  }

  const codeRow = await engine.ownerPool.query<{
    code: string;
    client_id: string;
    workspace_id: string;
    principal_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    scope: string;
    expires_at: Date;
  }>(
    `DELETE FROM kitsune.mcp_oauth_codes
      WHERE code = $1
      RETURNING code, client_id, workspace_id, principal_id, redirect_uri,
                code_challenge, code_challenge_method, scope, expires_at`,
    [code],
  );
  const auth = codeRow.rows[0];
  if (!auth) {
    return { error: 'invalid_grant', status: 400 };
  }
  if (auth.client_id !== clientId || auth.redirect_uri !== redirectUri) {
    return { error: 'invalid_grant', status: 400 };
  }
  const nowMs = deps?.nowMs?.() ?? Date.now();
  if (new Date(auth.expires_at).getTime() < nowMs) {
    return { error: 'invalid_grant', status: 400 };
  }
  if (auth.code_challenge_method !== 'S256') {
    return { error: 'invalid_grant', status: 400 };
  }
  if (pkceChallengeS256(codeVerifier) !== auth.code_challenge) {
    return { error: 'invalid_grant', status: 400 };
  }

  const minted = mintMcpAccessToken(
    {
      workspaceId: auth.workspace_id,
      principalId: auth.principal_id,
      clientId,
      scope: auth.scope,
    },
    deps,
  );

  return {
    access_token: minted.accessToken,
    token_type: 'Bearer',
    expires_in: minted.expiresIn,
    scope: auth.scope,
  };
}

export interface McpOAuthConsentPageData {
  pendingId: string;
  clientName: string;
  workspaceLabel: string;
  scope: string;
  csrfToken: string;
}

export type LoadMcpOAuthConsentPageResult =
  | { ok: true; data: McpOAuthConsentPageData }
  | {
      ok: false;
      reason: 'missing' | 'expired' | 'wrong_account';
    };

/** Load pending consent + client/workspace labels for the consent UI. */
export async function loadMcpOAuthConsentPage(
  engine: KitsuneEngine,
  input: {
    pendingId: string;
    workspaceId: string;
    principalId: string;
  },
  deps?: McpOAuthDeps,
): Promise<LoadMcpOAuthConsentPageResult> {
  const pendingResult = await engine.ownerPool.query<{
    id: string;
    client_id: string;
    workspace_id: string;
    principal_id: string;
    scope: string;
    csrf_token: string;
    expires_at: string;
  }>(
    `SELECT id, client_id, workspace_id, principal_id, scope, csrf_token, expires_at
       FROM kitsune.mcp_oauth_pending WHERE id = $1`,
    [input.pendingId],
  );
  const pending = pendingResult.rows[0];
  const nowMs = deps?.nowMs?.() ?? Date.now();
  if (!pending || new Date(pending.expires_at).getTime() < nowMs) {
    return { ok: false, reason: 'expired' };
  }
  if (
    pending.workspace_id !== input.workspaceId ||
    pending.principal_id !== input.principalId
  ) {
    return { ok: false, reason: 'wrong_account' };
  }

  const clientResult = await engine.ownerPool.query<{
    client_name: string;
  }>(`SELECT client_name FROM kitsune.mcp_oauth_clients WHERE client_id = $1`, [
    pending.client_id,
  ]);
  const clientName = clientResult.rows[0]?.client_name ?? pending.client_id;

  const workspaceResult = await engine.ownerPool.query<{
    name: string | null;
    slug: string;
  }>(`SELECT name, slug FROM kitsune.workspaces WHERE id = $1`, [
    pending.workspace_id,
  ]);
  const workspaceLabel =
    workspaceResult.rows[0]?.name ||
    workspaceResult.rows[0]?.slug ||
    pending.workspace_id;

  return {
    ok: true,
    data: {
      pendingId: pending.id,
      clientName,
      workspaceLabel,
      scope: pending.scope,
      csrfToken: pending.csrf_token,
    },
  };
}

export function isMcpOAuthClientError(
  result: unknown,
): result is McpOAuthClientError {
  return (
    typeof result === 'object' &&
    result !== null &&
    'error' in result &&
    'status' in result &&
    !('access_token' in result) &&
    !('client_id' in result) &&
    !('pendingId' in result)
  );
}
