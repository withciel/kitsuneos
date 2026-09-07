import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addMonths,
  dayKey,
  monthGridDays,
  parseDateFieldValue,
  startOfMonth,
} from './calendar-grid.ts';

describe('calendar-grid', () => {
  it('dayKey formats local date as YYYY-MM-DD', () => {
    assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
    assert.equal(dayKey(new Date(2026, 8, 30)), '2026-09-30');
  });

  it('startOfMonth zeroes the day', () => {
    const start = startOfMonth(new Date(2026, 5, 17));
    assert.equal(start.getDate(), 1);
    assert.equal(start.getMonth(), 5);
  });

  it('addMonths shifts month and clamps to day 1', () => {
    const next = addMonths(new Date(2026, 0, 31), 1);
    assert.equal(next.getMonth(), 1);
    assert.equal(next.getDate(), 1);
  });

  it('monthGridDays returns full Sun-Sat weeks covering the month', () => {
    const days = monthGridDays(new Date(2026, 8, 1)); // September 2026
    assert.equal(days.length % 7, 0);
    assert.equal(days[0]?.getDay(), 0);
    assert.equal(days[days.length - 1]?.getDay(), 6);
    const monthDays = days.filter((d) => d.getMonth() === 8);
    assert.equal(monthDays.length, 30);
  });

  it('parseDateFieldValue accepts ISO strings and epoch numbers', () => {
    assert.ok(parseDateFieldValue('2026-09-07T00:00:00.000Z') !== null);
    assert.ok(parseDateFieldValue(1_700_000_000_000) !== null);
    assert.equal(parseDateFieldValue('not-a-date'), null);
    assert.equal(parseDateFieldValue(null), null);
    assert.equal(parseDateFieldValue(undefined), null);
  });
});
