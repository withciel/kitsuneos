import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseVaultMarkdown,
  serializeVaultMarkdown,
  vaultFileName,
} from './vault-md.ts';

describe('vault markdown', () => {
  it('parses frontmatter id/title and trims body', () => {
    const raw = '---\nid: abc-123\ntitle: "My Note"\n---\n\nHello world\n';
    const parsed = parseVaultMarkdown(raw, 'whatever.md');
    assert.equal(parsed.id, 'abc-123');
    assert.equal(parsed.title, 'My Note');
    assert.equal(parsed.body, 'Hello world');
  });

  it('falls back to a title derived from the file name when frontmatter is missing', () => {
    const parsed = parseVaultMarkdown(
      'Just prose, no frontmatter.',
      'My-Great_Note.md',
    );
    assert.equal(parsed.id, undefined);
    assert.equal(parsed.title, 'My Great Note');
    assert.equal(parsed.body, 'Just prose, no frontmatter.');
  });

  it('round-trips through serialize + parse', () => {
    const serialized = serializeVaultMarkdown({
      id: 'rec-1',
      title: 'Round Trip',
      body: 'Some body text.',
    });
    const parsed = parseVaultMarkdown(serialized, 'ignored.md');
    assert.equal(parsed.id, 'rec-1');
    assert.equal(parsed.title, 'Round Trip');
    assert.equal(parsed.body, 'Some body text.');
  });

  it('produces a slugified, unique-ish file name', () => {
    const name = vaultFileName('Hello, World!', '0123456789abcdef');
    assert.equal(name, 'hello-world-01234567.md');
  });

  it('falls back to the id when the title has no slug-able characters', () => {
    const name = vaultFileName('!!!', '0123456789abcdef');
    assert.equal(name, '01234567.md');
  });
});
