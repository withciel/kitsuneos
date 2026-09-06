import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { Pool } from 'pg';
import { KitsuneError } from '../types.js';

const CLIENT_ID_PREFIX = 'ko_app_';
const CLIENT_SECRET_PREFIX = 'kosec_';
const ACCESS_TOKEN_PREFIX = 'koat_';

export type OAuthScope = 'databases:create' | 'records:read' | 'records:write';

export interface OAuthAppSummary {
  id: string;
  name: string;
  clientId: string;
  scopes: string[];
  redirectUris: string[];
  principalId: string;
  createdAt: string;
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function generateOAuthClientId(): string {
  return `${CLIENT_ID_PREFIX}${randomBytes(12).toString('hex')}`;
}

export function generateOAuthClientSecret(): string {
  return `${CLIENT_SECRET_PREFIX}${randomBytes(24).toString('hex')}`;
}

export function generateOAuthAccessToken(): string {
  return `${ACCESS_TOKEN_PREFIX}${randomBytes(24).toString('hex')}`;
}

export async function listOAuthApps(
  pool: Pool,
  workspaceId: string,
): Promise<OAuthAppSummary[]> {
  const result = await pool.query<{
    id: string;
    name: string;
    client_id: string;
    scopes: string[];
    redirect_uris: string[];
    principal_id: string;
    created_at: Date;
  }>(
    `SELECT id, name, client_id, scopes, redirect_uris, principal_id, created_at
       FROM kitsune.oauth_apps
      WHERE workspace_id = $1
        AND revoked_at IS NULL
      ORDER BY created_at ASC`,
    [workspaceId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    scopes: row.scopes,
    redirectUris: row.redirect_uris,
    principalId: row.principal_id,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function createOAuthApp(
  pool: Pool,
  input: {
    workspaceId: string;
    name: string;
    redirectUris?: string[];
    scopes?: OAuthScope[];
    principalId: string;
    createdBy: string;
  },
): Promise<{
  app: OAuthAppSummary;
  clientSecret: string;
}> {
  const name = input.name.trim();
  if (!name) {
    throw new KitsuneError('App name is required', 'validation');
  }
  const id = randomUUID();
  const clientId = generateOAuthClientId();
  const clientSecret = generateOAuthClientSecret();
  const scopes = input.scopes ?? [
    'databases:create',
    'records:read',
    'records:write',
  ];
  const redirectUris = input.redirectUris ?? [];
  await pool.query(
    `INSERT INTO kitsune.oauth_apps
       (id, workspace_id, name, client_id, client_secret_hash, redirect_uris,
        scopes, principal_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      input.workspaceId,
      name,
      clientId,
      hashSecret(clientSecret),
      redirectUris,
      scopes,
      input.principalId,
      input.createdBy,
    ],
  );
  return {
    app: {
      id,
      name,
      clientId,
      scopes,
      redirectUris,
      principalId: input.principalId,
      createdAt: new Date().toISOString(),
    },
    clientSecret,
  };
}

export async function revokeOAuthApp(
  pool: Pool,
  input: { workspaceId: string; appId: string },
): Promise<void> {
  await pool.query(
    `UPDATE kitsune.oauth_apps
        SET revoked_at = now()
      WHERE id = $1
        AND workspace_id = $2
        AND revoked_at IS NULL`,
    [input.appId, input.workspaceId],
  );
  await pool.query(
    `UPDATE kitsune.oauth_access_tokens
        SET revoked_at = now()
      WHERE app_id = $1
        AND revoked_at IS NULL`,
    [input.appId],
  );
}

/** Client-credentials grant for workspace-owned OAuth apps. */
export async function issueOAuthClientCredentialsToken(
  pool: Pool,
  input: { clientId: string; clientSecret: string },
): Promise<{
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
  workspaceId: string;
  principalId: string;
}> {
  const app = await pool.query<{
    id: string;
    workspace_id: string;
    principal_id: string;
    client_secret_hash: string;
    scopes: string[];
  }>(
    `SELECT id, workspace_id, principal_id, client_secret_hash, scopes
       FROM kitsune.oauth_apps
      WHERE client_id = $1
        AND revoked_at IS NULL`,
    [input.clientId],
  );
  const row = app.rows[0];
  if (
    !row ||
    !safeEqualHex(hashSecret(input.clientSecret), row.client_secret_hash)
  ) {
    throw new KitsuneError('Invalid client credentials', 'forbidden');
  }
  const accessToken = generateOAuthAccessToken();
  const expiresIn = 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  await pool.query(
    `INSERT INTO kitsune.oauth_access_tokens
       (id, app_id, workspace_id, principal_id, token_hash, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      row.id,
      row.workspace_id,
      row.principal_id,
      hashSecret(accessToken),
      row.scopes,
      expiresAt.toISOString(),
    ],
  );
  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn,
    scope: row.scopes.join(' '),
    workspaceId: row.workspace_id,
    principalId: row.principal_id,
  };
}

export async function resolveOAuthAccessToken(
  pool: Pool,
  token: string,
): Promise<{
  workspaceId: string;
  principalId: string;
  scopes: string[];
  appId: string;
} | null> {
  if (!token.startsWith(ACCESS_TOKEN_PREFIX)) return null;
  const result = await pool.query<{
    workspace_id: string;
    principal_id: string;
    scopes: string[];
    app_id: string;
  }>(
    `SELECT workspace_id, principal_id, scopes, app_id
       FROM kitsune.oauth_access_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > now()`,
    [hashSecret(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    workspaceId: row.workspace_id,
    principalId: row.principal_id,
    scopes: row.scopes,
    appId: row.app_id,
  };
}
