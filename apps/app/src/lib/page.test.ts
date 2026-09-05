import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  pageHref,
  pickBodyField,
  pickTitleField,
  resolvePage,
} from './page.ts';

describe('pickBodyField', () => {
  it('prefers prose field named body', () => {
    const picked = pickBodyField([
      { name: 'notes', type: 'prose' },
      { name: 'body', type: 'prose' },
      { name: 'title', type: 'text' },
    ]);
    assert.equal(picked?.name, 'body');
  });

  it('falls back to first prose field', () => {
    const picked = pickBodyField([
      { name: 'title', type: 'text' },
      { name: 'notes', type: 'prose' },
      { name: 'summary', type: 'prose' },
    ]);
    assert.equal(picked?.name, 'notes');
  });

  it('returns undefined when no prose fields exist', () => {
    assert.equal(
      pickBodyField([
        { name: 'title', type: 'text' },
        { name: 'amount', type: 'number' },
      ]),
      undefined,
    );
  });
});

describe('pickTitleField', () => {
  it('prefers name over title over email', () => {
    assert.equal(
      pickTitleField([
        { name: 'email', type: 'text' },
        { name: 'title', type: 'text' },
        { name: 'name', type: 'text' },
      ])?.name,
      'name',
    );
    assert.equal(
      pickTitleField([
        { name: 'email', type: 'text' },
        { name: 'title', type: 'text' },
      ])?.name,
      'title',
    );
  });

  it('falls back to first non-id non-prose field', () => {
    assert.equal(
      pickTitleField([
        { name: 'id', type: 'text' },
        { name: 'body', type: 'prose' },
        { name: 'stage', type: 'text' },
      ])?.name,
      'stage',
    );
  });
});

describe('pageHref / resolvePage', () => {
  it('builds bookmarkable href with collection query', () => {
    assert.equal(
      pageHref('abc-123', 'opportunities'),
      '/p/abc-123?c=opportunities',
    );
  });

  it('requires collection query param', () => {
    assert.deepEqual(resolvePage('abc-123', 'accounts'), {
      pageId: 'abc-123',
      collection: 'accounts',
    });
    assert.throws(() => resolvePage('abc-123', null), /c is required/);
    assert.throws(() => resolvePage('', 'accounts'), /pageId is required/);
  });
});
