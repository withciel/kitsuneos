import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SETTINGS_TAB_LABELS, SETTINGS_TABS } from './settings-tabs.ts';

describe('SETTINGS_TABS', () => {
  it('matches Notion settings chrome without Databases', () => {
    assert.deepEqual(SETTINGS_TAB_LABELS, [
      'Account',
      'People',
      'Teams',
      'Access',
      'Webhooks',
      'Connect AI',
    ]);
    assert.equal(
      SETTINGS_TABS.some((tab) => /database|schema|grant/i.test(tab.label)),
      false,
    );
    assert.equal(
      SETTINGS_TABS.some((tab) => /schema|database/i.test(tab.href)),
      false,
    );
  });
});
