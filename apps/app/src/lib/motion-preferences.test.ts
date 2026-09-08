import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prefersReducedMotion } from './motion-preferences.ts';

describe('prefersReducedMotion', () => {
  it('returns false without window matchMedia', () => {
    assert.equal(prefersReducedMotion(), false);
  });
});
