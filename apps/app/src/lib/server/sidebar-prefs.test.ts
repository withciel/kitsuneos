import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseCollapsed,
  parseFavorites,
  serializeCollapsed,
  serializeFavorites,
} from './sidebar-prefs.ts';

describe('sidebar-prefs', () => {
  it('parses and serializes favorites', () => {
    const favorites = parseFavorites(
      JSON.stringify([
        { type: 'collection', id: 'notes', href: '/c/notes' },
        { type: 'page', id: 'x' },
        { type: 'collection', id: '  ' },
        null,
      ]),
    );
    assert.deepEqual(favorites, [
      { type: 'collection', id: 'notes', href: '/c/notes' },
    ]);
    assert.equal(
      serializeFavorites(favorites),
      '[{"type":"collection","id":"notes","href":"/c/notes"}]',
    );
  });

  it('parses collapsed section ids', () => {
    assert.deepEqual(
      parseCollapsed(JSON.stringify(['personal', 'favorites'])),
      ['personal', 'favorites'],
    );
    assert.deepEqual(parseCollapsed('not-json'), []);
    assert.equal(serializeCollapsed(['a', 'a', 'b']), '["a","b"]');
  });
});
