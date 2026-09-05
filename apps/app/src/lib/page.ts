/** Field metadata needed to pick title/body presentation fields. */
export interface PageFieldMeta {
  name: string;
  type: string;
}

const PREFERRED_TITLE_FIELDS = ['name', 'title', 'email'] as const;

/**
 * Prefer a prose field named `body`, else the first prose field.
 * Returns undefined when the collection has no prose column.
 */
export function pickBodyField<T extends PageFieldMeta>(
  fields: readonly T[],
): T | undefined {
  const prose = fields.filter((field) => field.type === 'prose');
  const namedBody = prose.find((field) => field.name === 'body');
  return namedBody ?? prose[0];
}

/**
 * Prefer label fields used by `recordLabel` (`name` / `title` / `email`),
 * else the first non-id, non-prose field, else any non-id field.
 */
export function pickTitleField<T extends PageFieldMeta>(
  fields: readonly T[],
): T | undefined {
  for (const preferred of PREFERRED_TITLE_FIELDS) {
    const match = fields.find((field) => field.name === preferred);
    if (match) return match;
  }
  const nonProse = fields.find(
    (field) =>
      field.name !== 'id' &&
      field.type !== 'prose' &&
      field.type !== 'relation',
  );
  if (nonProse) return nonProse;
  return fields.find((field) => field.name !== 'id');
}

/** Bookmarkable page URL. Collection is required in v1 to avoid UUID scans. */
export function pageHref(pageId: string, collection: string): string {
  const params = new URLSearchParams({ c: collection });
  return `/p/${pageId}?${params.toString()}`;
}

/**
 * Resolve route params for `/p/[pageId]?c=…`.
 * v1: pageId === record UUID; collection must come from `?c=`.
 */
export function resolvePage(
  pageId: string,
  collection: string | null | undefined,
): { pageId: string; collection: string } {
  const trimmedId = pageId.trim();
  const trimmedCollection = collection?.trim() ?? '';
  if (!trimmedId) {
    throw new Error('pageId is required');
  }
  if (!trimmedCollection) {
    throw new Error('collection query param c is required');
  }
  return { pageId: trimmedId, collection: trimmedCollection };
}
