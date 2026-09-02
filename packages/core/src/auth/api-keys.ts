import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import type { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { KitsuneError } from '../types.js';

const KEY_PREFIX_LIVE = 'kso_live_';
const KEY_PREFIX_TEST = 'kso_test_';

export interface ResolvedApiKey {
  keyId: string;
  keyPrefix: string;
  principalId: string;
  workspaceId: string;
  schemaName: string;
}

function hashKey(plaintext: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plaintext, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyKey(plaintext: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) {
    return false;
  }
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(plaintext, salt, 64);
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

export function generateApiKeyPlaintext(
  mode: 'live' | 'test' = 'live',
): string {
  const prefix = mode === 'live' ? KEY_PREFIX_LIVE : KEY_PREFIX_TEST;
  const body = randomBytes(24).toString('base64url');
  return `${prefix}${body}`;
}

export function apiKeyDisplayPrefix(plaintext: string): string {
  return plaintext.slice(0, 12);
}

export async function createApiKey(
  ownerPool: Pool,
  principalId: string,
  mode: 'live' | 'test' = 'live',
): Promise<{ keyId: string; plaintext: string; prefix: string }> {
  const plaintext = generateApiKeyPlaintext(mode);
  const prefix = apiKeyDisplayPrefix(plaintext);
  const keyId = uuidv4();
  await ownerPool.query(
    `INSERT INTO kitsune.api_keys (id, principal_id, prefix, key_hash)
     VALUES ($1, $2, $3, $4)`,
    [keyId, principalId, prefix, hashKey(plaintext)],
  );
  return { keyId, plaintext, prefix };
}

export async function revokeApiKey(
  ownerPool: Pool,
  keyId: string,
): Promise<void> {
  await ownerPool.query(
    `UPDATE kitsune.api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
    [keyId],
  );
}

export async function resolveApiKey(
  ownerPool: Pool,
  bearer: string,
): Promise<ResolvedApiKey> {
  if (
    !bearer.startsWith(KEY_PREFIX_LIVE) &&
    !bearer.startsWith(KEY_PREFIX_TEST)
  ) {
    throw new KitsuneError('Invalid API key', 'forbidden');
  }
  const prefix = apiKeyDisplayPrefix(bearer);
  const result = await ownerPool.query<{
    id: string;
    key_hash: string;
    principal_id: string;
    workspace_id: string;
    schema_name: string;
    revoked_at: Date | null;
  }>(
    `SELECT k.id, k.key_hash, k.principal_id, p.workspace_id, w.schema_name, k.revoked_at
       FROM kitsune.api_keys k
       JOIN kitsune.principals p ON p.id = k.principal_id
       JOIN kitsune.workspaces w ON w.id = p.workspace_id
      WHERE k.prefix = $1
        AND k.revoked_at IS NULL
        AND p.disabled_at IS NULL`,
    [prefix],
  );

  const row = result.rows.find((candidate) =>
    verifyKey(bearer, candidate.key_hash),
  );
  if (!row) {
    throw new KitsuneError('Invalid API key', 'forbidden');
  }

  await ownerPool.query(
    `UPDATE kitsune.api_keys SET last_used_at = now() WHERE id = $1`,
    [row.id],
  );

  return {
    keyId: row.id,
    keyPrefix: prefix,
    principalId: row.principal_id,
    workspaceId: row.workspace_id,
    schemaName: row.schema_name,
  };
}

export function hashApiKeyForAudit(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex').slice(0, 16);
}
