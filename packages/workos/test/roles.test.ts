import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fromWorkOSRoleSlug,
  isWorkOSConfigured,
  KITSUNE_AGENT_PERMISSIONS,
  toWorkOSRoleSlug,
} from '../src/index.ts';

describe('@kitsuneos/workos roles', () => {
  it('maps Kitsune roles to WorkOS slugs 1:1', () => {
    assert.equal(toWorkOSRoleSlug('owner'), 'owner');
    assert.equal(toWorkOSRoleSlug('admin'), 'admin');
    assert.equal(toWorkOSRoleSlug('member'), 'member');
    assert.equal(fromWorkOSRoleSlug('owner'), 'owner');
    assert.equal(fromWorkOSRoleSlug('unknown'), 'member');
  });

  it('defines agent permission ceiling without write by default', () => {
    assert.deepEqual(
      [...KITSUNE_AGENT_PERMISSIONS],
      ['kitsune:propose', 'kitsune:read'],
    );
  });

  it('reports WorkOS unconfigured when API key missing', () => {
    const prev = process.env.WORKOS_API_KEY;
    delete process.env.WORKOS_API_KEY;
    assert.equal(isWorkOSConfigured(), false);
    if (prev !== undefined) process.env.WORKOS_API_KEY = prev;
  });
});
