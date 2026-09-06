/** CMS publish lifecycle convention: draft → published → archived. */

export const PUBLISH_STATUSES = ['draft', 'published', 'archived'] as const;

export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

export interface PublishFieldMeta {
  name: string;
  type: string;
  enumValues?: string[];
  writable?: boolean;
}

/** True when `values` includes every publish status (order-independent). */
export function hasPublishStatusValues(
  values: readonly string[] | undefined,
): boolean {
  if (!values || values.length < PUBLISH_STATUSES.length) return false;
  const set = new Set(values);
  return PUBLISH_STATUSES.every((status) => set.has(status));
}

/**
 * Prefer a field named `status` whose enum covers draft/published/archived,
 * else the first enum field with that value set.
 */
export function pickStatusField<T extends PublishFieldMeta>(
  fields: readonly T[],
): T | undefined {
  const enums = fields.filter(
    (field) =>
      field.type === 'enum' && hasPublishStatusValues(field.enumValues),
  );
  const named = enums.find((field) => field.name === 'status');
  return named ?? enums[0];
}

/** Collection is publishable when it has a qualifying status enum field. */
export function isPublishableCollection(
  fields: readonly PublishFieldMeta[],
): boolean {
  return pickStatusField(fields) !== undefined;
}

export function normalizePublishStatus(
  value: string | null | undefined,
): PublishStatus | null {
  if (!value) return null;
  return (PUBLISH_STATUSES as readonly string[]).includes(value)
    ? (value as PublishStatus)
    : null;
}

export function publishStatusLabel(status: PublishStatus): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'published':
      return 'Published';
    case 'archived':
      return 'Archived';
  }
}
