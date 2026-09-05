import type { JsonValue } from '@kitsuneos/core';

const PREFERRED_LABELS = ['name', 'title', 'email'] as const;

export function recordLabel(row: Record<string, JsonValue>): string {
  for (const key of PREFERRED_LABELS) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id') continue;
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  if (typeof row.id === 'string' && row.id) {
    return row.id.slice(0, 8);
  }
  return 'Untitled';
}
