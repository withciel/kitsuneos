import type { KitsuneEngine, ResolvedApiKey } from '@kitsuneos/core';
import { apiKeyDisplayPrefix, KitsuneError } from '@kitsuneos/core';

export interface CredentialContext extends ResolvedApiKey {}

export async function resolveCredential(
  engine: KitsuneEngine,
  authorizationHeader: string | undefined,
): Promise<CredentialContext> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new KitsuneError('Missing bearer token', 'forbidden');
  }
  const token = authorizationHeader.slice('Bearer '.length).trim();
  return engine.resolveApiKey(token);
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
  await engine.recordAuthFailure(reason, prefix);
}
