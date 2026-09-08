// workspace-lint: ignore — Postgres E2E inserts into mcp_oauth_pending use
// workspace_id columns; workspace is never taken from a client request.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { DEFAULT_CONFIG, KitsuneEngine, migrate } from '@kitsuneos/core';
import {
  ensureMcpOAuthTables,
  newCsrfToken,
  newPendingConsentId,
  pkceChallengeS256,
} from './mcp-oauth.ts';
import {
  consentOriginMismatch,
  isConsentDecisionError,
  parseConsentDecisionBody,
  processConsentDecision,
} from './mcp-oauth-consent.ts';

describe('mcp oauth consent helpers', () => {
  it('parseConsentDecisionBody defaults missing fields to empty strings', () => {
    assert.deepEqual(parseConsentDecisionBody({}), {
      decision: '',
      pendingId: '',
      csrfToken: '',
    });
    assert.deepEqual(
      parseConsentDecisionBody({
        decision: 'approve',
        pendingId: 'p1',
        csrfToken: 'c1',
      }),
      { decision: 'approve', pendingId: 'p1', csrfToken: 'c1' },
    );
  });

  it('consentOriginMismatch allows missing Origin/Referer', () => {
    const request = new Request(
      'https://app.example.test/api/mcp/oauth/consent',
      {
        method: 'POST',
      },
    );
    assert.equal(
      consentOriginMismatch(request, 'https://app.example.test'),
      false,
    );
  });

  it('consentOriginMismatch rejects foreign Origin host', () => {
    const request = new Request(
      'https://app.example.test/api/mcp/oauth/consent',
      {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      },
    );
    assert.equal(
      consentOriginMismatch(request, 'https://app.example.test'),
      true,
    );
  });

  it('consentOriginMismatch accepts matching Referer host', () => {
    const request = new Request(
      'https://app.example.test/api/mcp/oauth/consent',
      {
        method: 'POST',
        headers: {
          referer: 'https://app.example.test/oauth/mcp/consent?pending=x',
        },
      },
    );
    assert.equal(
      consentOriginMismatch(request, 'https://app.example.test'),
      false,
    );
  });
});

describe('processConsentDecision (Postgres E2E)', () => {
  let engine: KitsuneEngine;
  let workspaceId: string;
  let principalId: string;
  const clientId = `client_${Date.now()}`;
  const redirectUri = 'http://127.0.0.1:9876/callback';
  const verifier = 'consent-e2e-verifier-abcdefghijklmnopqrstuvwxyz';

  before(async () => {
    process.env.KITSUNE_MCP_OAUTH_SECRET ??=
      'test-mcp-oauth-secret-for-consent-e2e';
    await migrate(DEFAULT_CONFIG);
    engine = new KitsuneEngine({ config: DEFAULT_CONFIG });
    await ensureMcpOAuthTables(engine);
    const ws = await engine.createWorkspace(`oauth-consent-${Date.now()}`);
    workspaceId = ws.workspaceId;
    principalId = await engine.createPrincipal(
      workspaceId,
      'human',
      'Consent Tester',
    );
    await engine.ownerPool.query(
      `INSERT INTO kitsune.mcp_oauth_clients
         (client_id, client_secret_hash, client_name, redirect_uris)
       VALUES ($1, NULL, $2, $3)
       ON CONFLICT (client_id) DO NOTHING`,
      [clientId, 'Consent E2E Client', [redirectUri]],
    );
  });

  after(async () => {
    await engine?.close?.();
  });

  async function insertPending(overrides?: {
    csrf?: string;
    expiresAt?: Date;
    principalId?: string;
  }) {
    const pendingId = newPendingConsentId();
    const csrf = overrides?.csrf ?? newCsrfToken();
    const expiresAt =
      overrides?.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000);
    await engine.ownerPool.query(
      `INSERT INTO kitsune.mcp_oauth_pending
         (id, client_id, workspace_id, principal_id, redirect_uri,
          code_challenge, code_challenge_method, scope, state, csrf_token, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,'S256','mcp:tools','state-1',$7,$8)`,
      [
        pendingId,
        clientId,
        workspaceId,
        overrides?.principalId ?? principalId,
        redirectUri,
        pkceChallengeS256(verifier),
        csrf,
        expiresAt.toISOString(),
      ],
    );
    return { pendingId, csrf };
  }

  it('approve mints an auth code and consumes the pending row', async () => {
    const { pendingId, csrf } = await insertPending();
    const result = await processConsentDecision(engine, {
      decision: 'approve',
      pendingId,
      csrfToken: csrf,
      workspaceId,
      principalId,
    });
    assert.equal(isConsentDecisionError(result), false);
    if (isConsentDecisionError(result)) return;
    assert.equal(result.issuedCode, true);
    const url = new URL(result.redirectUrl);
    assert.ok(url.searchParams.get('code'));
    assert.equal(url.searchParams.get('state'), 'state-1');

    const pendingLeft = await engine.ownerPool.query(
      `SELECT 1 FROM kitsune.mcp_oauth_pending WHERE id = $1`,
      [pendingId],
    );
    assert.equal(pendingLeft.rowCount, 0);

    const codes = await engine.ownerPool.query(
      `SELECT code FROM kitsune.mcp_oauth_codes WHERE code = $1`,
      [url.searchParams.get('code')],
    );
    assert.equal(codes.rowCount, 1);
  });

  it('deny redirects with access_denied and never mints a code', async () => {
    const { pendingId, csrf } = await insertPending();
    const before = await engine.ownerPool.query(
      `SELECT COUNT(*)::int AS n FROM kitsune.mcp_oauth_codes WHERE client_id = $1`,
      [clientId],
    );
    const result = await processConsentDecision(engine, {
      decision: 'deny',
      pendingId,
      csrfToken: csrf,
      workspaceId,
      principalId,
    });
    assert.equal(isConsentDecisionError(result), false);
    if (isConsentDecisionError(result)) return;
    assert.equal(result.issuedCode, false);
    const url = new URL(result.redirectUrl);
    assert.equal(url.searchParams.get('error'), 'access_denied');
    assert.equal(url.searchParams.get('code'), null);

    const after = await engine.ownerPool.query(
      `SELECT COUNT(*)::int AS n FROM kitsune.mcp_oauth_codes WHERE client_id = $1`,
      [clientId],
    );
    assert.equal(after.rows[0]?.n, before.rows[0]?.n);
  });

  it('expired approve is treated as access_denied without a code', async () => {
    const { pendingId, csrf } = await insertPending({
      expiresAt: new Date(Date.now() - 60_000),
    });
    const result = await processConsentDecision(engine, {
      decision: 'approve',
      pendingId,
      csrfToken: csrf,
      workspaceId,
      principalId,
    });
    assert.equal(isConsentDecisionError(result), false);
    if (isConsentDecisionError(result)) return;
    assert.equal(result.issuedCode, false);
    assert.equal(
      new URL(result.redirectUrl).searchParams.get('error'),
      'access_denied',
    );
  });

  it('rejects wrong CSRF without consuming the pending row', async () => {
    const { pendingId } = await insertPending();
    const result = await processConsentDecision(engine, {
      decision: 'approve',
      pendingId,
      csrfToken: 'not-the-token',
      workspaceId,
      principalId,
    });
    assert.equal(isConsentDecisionError(result), true);
    if (!isConsentDecisionError(result)) return;
    assert.equal(result.status, 403);
    assert.match(result.error_description, /CSRF/i);

    const pendingLeft = await engine.ownerPool.query(
      `SELECT 1 FROM kitsune.mcp_oauth_pending WHERE id = $1`,
      [pendingId],
    );
    assert.equal(pendingLeft.rowCount, 1);
  });

  it('rejects a different principal without consuming the pending row', async () => {
    const other = await engine.createPrincipal(
      workspaceId,
      'human',
      'Other Human',
    );
    const { pendingId, csrf } = await insertPending();
    const result = await processConsentDecision(engine, {
      decision: 'approve',
      pendingId,
      csrfToken: csrf,
      workspaceId,
      principalId: other,
    });
    assert.equal(isConsentDecisionError(result), true);
    if (!isConsentDecisionError(result)) return;
    assert.equal(result.status, 403);

    const pendingLeft = await engine.ownerPool.query(
      `SELECT 1 FROM kitsune.mcp_oauth_pending WHERE id = $1`,
      [pendingId],
    );
    assert.equal(pendingLeft.rowCount, 1);
  });
});
