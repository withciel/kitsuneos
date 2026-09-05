import type { KitsuneEngine } from '@kitsuneos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { createStandardFixture, type Fixture, getEngine } from './fixtures.js';

describe('R16 cross-workspace principal identity', () => {
  let engine: KitsuneEngine;
  let fixture: Fixture;

  beforeAll(async () => {
    engine = await getEngine();
    fixture = await createStandardFixture(engine);
  });

  it('links and resolves the same subject across workspaces', async () => {
    await engine.linkPrincipalIdentity(fixture.workspaceId, fixture.adminId, {
      principalId: fixture.adminId,
      externalIssuer: 'workos',
      externalSubject: 'user_federation_admin_1',
    });

    const other = await createStandardFixture(engine);
    await engine.linkPrincipalIdentity(other.workspaceId, other.adminId, {
      principalId: other.adminId,
      externalIssuer: 'workos',
      externalSubject: 'user_federation_admin_1',
    });

    const hits = await engine.resolvePrincipalsByExternalSubject(
      'workos',
      'user_federation_admin_1',
    );
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(
      hits.some(
        (h) =>
          h.workspaceId === fixture.workspaceId &&
          h.principalId === fixture.adminId,
      ),
    ).toBe(true);
    expect(
      hits.some(
        (h) =>
          h.workspaceId === other.workspaceId &&
          h.principalId === other.adminId,
      ),
    ).toBe(true);
  });

  it('copies external identity onto branch principals', async () => {
    const subject = `user_branch_${fixture.workspaceId.slice(0, 8)}`;
    await engine.linkPrincipalIdentity(fixture.workspaceId, fixture.adminId, {
      principalId: fixture.adminId,
      externalIssuer: 'workos',
      externalSubject: subject,
    });

    const branch = await engine.createBranch(
      fixture.workspaceId,
      fixture.adminId,
      { name: `fed-${Date.now().toString(36)}` },
    );

    const hits = await engine.resolvePrincipalsByExternalSubject(
      'workos',
      subject,
    );
    expect(hits.some((h) => h.workspaceId === fixture.workspaceId)).toBe(true);
    expect(hits.some((h) => h.workspaceId === branch.workspaceId)).toBe(true);
  });

  it('rejects duplicate identities in the same workspace and non-admins', async () => {
    const subject = `user_dup_${fixture.workspaceId.slice(0, 8)}`;
    await engine.linkPrincipalIdentity(fixture.workspaceId, fixture.adminId, {
      principalId: fixture.adminId,
      externalIssuer: 'workos',
      externalSubject: subject,
    });

    await expect(
      engine.linkPrincipalIdentity(fixture.workspaceId, fixture.adminId, {
        principalId: fixture.readerId,
        externalIssuer: 'workos',
        externalSubject: subject,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    await expect(
      engine.linkPrincipalIdentity(fixture.workspaceId, fixture.readerId, {
        principalId: fixture.readerId,
        externalIssuer: 'workos',
        externalSubject: `user_reader_${fixture.workspaceId.slice(0, 8)}`,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
