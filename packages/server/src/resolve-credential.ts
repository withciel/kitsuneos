import type { KitsuneEngine, ResolvedApiKey } from '@kitsuneos/core';
import {
  apiKeyDisplayPrefix,
  KitsuneError,
  resolveApiKey,
} from '@kitsuneos/core';

export interface CredentialContext extends ResolvedApiKey {}

export async function resolveCredential(
  engine: KitsuneEngine,
  authorizationHeader: string | undefined,
): Promise<CredentialContext> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new KitsuneError('Missing bearer token', 'forbidden');
  }
  const token = authorizationHeader.slice('Bearer '.length).trim();
  return resolveApiKey(engine.ownerPool, token);
}

export async function auditAuthFailure(
  engine: KitsuneEngine,
  authorizationHeader: string | undefined,
  reason: string,
): Promise<void> {
  const token = authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length).trim()
    : '';
  const prefix =
    token.startsWith('kso_live_') || token.startsWith('kso_test_')
      ? apiKeyDisplayPrefix(token)
      : 'unknown';
  await engine.ownerPool.query(
    `INSERT INTO kitsune.audit_log
      (id, workspace_id, principal_id, action, outcome, reason, detail)
     VALUES (
       gen_random_uuid(),
       '00000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-000000000002',
       'auth_failed',
       'denied',
       $1,
       $2::jsonb
     )`,
    [reason, JSON.stringify({ keyPrefix: prefix })],
  );
}
