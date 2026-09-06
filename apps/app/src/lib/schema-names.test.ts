import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isValidSchemaName } from './schema-names.ts';

describe('isValidSchemaName', () => {
  it('accepts lowercase snake identifiers', () => {
    assert.equal(isValidSchemaName('status'), true);
    assert.equal(isValidSchemaName('account_id'), true);
    assert.equal(isValidSchemaName('_private'), true);
  });

  it('rejects empty, uppercase, spaced, and punctuated names', () => {
    assert.equal(isValidSchemaName(''), false);
    assert.equal(isValidSchemaName('Status'), false);
    assert.equal(isValidSchemaName('my status'), false);
    assert.equal(isValidSchemaName('1status'), false);
    assert.equal(isValidSchemaName('status-name'), false);
  });
});
