import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasPublishStatusValues,
  isPublishableCollection,
  PUBLISH_STATUSES,
  pickStatusField,
} from './publish-status.ts';

describe('publish-status', () => {
  it('exports draft|published|archived', () => {
    assert.deepEqual([...PUBLISH_STATUSES], ['draft', 'published', 'archived']);
  });

  it('detects publishable collections via status enum', () => {
    const fields = [
      { name: 'title', type: 'text' },
      {
        name: 'status',
        type: 'enum',
        enumValues: ['archived', 'draft', 'published'],
      },
    ];
    assert.equal(isPublishableCollection(fields), true);
    assert.equal(pickStatusField(fields)?.name, 'status');
    assert.equal(hasPublishStatusValues(['draft', 'published']), false);
  });

  it('rejects collections without the status convention', () => {
    assert.equal(
      isPublishableCollection([
        { name: 'stage', type: 'enum', enumValues: ['open', 'closed'] },
      ]),
      false,
    );
  });
});
