import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupOpsByPage, summarizePagesTouched } from './group-ops-by-page.ts';

describe('groupOpsByPage', () => {
  it('groups multi-collection ops into ≥2 pages', () => {
    const ops = [
      {
        id: '1',
        collection: 'opportunities',
        recordId: 'opp-1',
        fieldName: 'stage',
        seq: 1,
      },
      {
        id: '2',
        collection: 'opportunities',
        recordId: 'opp-1',
        fieldName: 'amount',
        seq: 2,
      },
      {
        id: '3',
        collection: 'accounts',
        recordId: 'acct-1',
        fieldName: 'status',
        seq: 3,
      },
    ];
    const groups = groupOpsByPage(ops);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.collection, 'opportunities');
    assert.equal(groups[0]?.recordId, 'opp-1');
    assert.equal(groups[0]?.ops.length, 2);
    assert.equal(groups[0]?.href, '/p/opp-1?c=opportunities');
    assert.equal(groups[1]?.collection, 'accounts');
    assert.equal(groups[1]?.recordId, 'acct-1');
    assert.equal(groups[1]?.ops.length, 1);
    assert.equal(groups[1]?.href, '/p/acct-1?c=accounts');
  });

  it('keeps insert ops without recordId in a new-page bucket', () => {
    const groups = groupOpsByPage([
      {
        id: '1',
        collection: 'contacts',
        recordId: null,
        fieldName: 'email',
      },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.recordId, null);
    assert.equal(groups[0]?.href, null);
    assert.equal(groups[0]?.key, 'contacts:new');
  });
});

describe('summarizePagesTouched', () => {
  it('formats page/database counts for list subtitles', () => {
    const summary = summarizePagesTouched([
      { collection: 'opportunities', recordId: 'a' },
      { collection: 'opportunities', recordId: 'a' },
      { collection: 'accounts', recordId: 'b' },
    ]);
    assert.equal(summary.pageCount, 2);
    assert.equal(summary.databaseCount, 2);
    assert.equal(summary.label, '2 pages across 2 databases');
  });
});
