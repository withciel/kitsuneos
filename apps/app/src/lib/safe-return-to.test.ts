import assert from 'node:assert/strict';
import { safeReturnTo } from './safe-return-to.ts';

assert.equal(safeReturnTo(null), '/');
assert.equal(safeReturnTo(''), '/');
assert.equal(safeReturnTo('/'), '/');
assert.equal(
  safeReturnTo(
    '/api/mcp/oauth/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=xyz&code_challenge=chal&code_challenge_method=S256&response_type=code',
  ),
  '/api/mcp/oauth/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&state=xyz&code_challenge=chal&code_challenge_method=S256&response_type=code',
);
assert.equal(safeReturnTo('https://evil.example/phish'), '/');
assert.equal(safeReturnTo('//evil.example/phish'), '/');
assert.equal(safeReturnTo('/\\evil.example'), '/');
assert.equal(safeReturnTo('/http://evil.example'), '/');
assert.equal(safeReturnTo('/dashboard?x=1#sec'), '/dashboard?x=1#sec');

console.log('safe-return-to: ok');
