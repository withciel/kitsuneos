/** Minimal op shape needed to group Inbox diffs by page. */
export interface PageGroupOp {
  id: string;
  collection: string;
  recordId: string | null;
  fieldName?: string | null;
  seq?: number;
}

export interface PageOpGroup<T extends PageGroupOp = PageGroupOp> {
  /** Stable key: `${collection}:${recordId ?? 'new'}` */
  key: string;
  collection: string;
  recordId: string | null;
  /** Link when recordId is known */
  href: string | null;
  ops: T[];
}

function hrefForPage(recordId: string, collection: string): string {
  const params = new URLSearchParams({ c: collection });
  return `/p/${recordId}?${params.toString()}`;
}

/**
 * Group change-set operations by page (collection + recordId).
 * Preserves first-seen page order; ops within a page stay in input order
 * (typically seq ascending from the API).
 */
export function groupOpsByPage<T extends PageGroupOp>(
  ops: readonly T[],
): PageOpGroup<T>[] {
  const groups = new Map<string, PageOpGroup<T>>();
  const order: string[] = [];

  for (const op of ops) {
    const recordId = op.recordId;
    const key = `${op.collection}:${recordId ?? 'new'}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        collection: op.collection,
        recordId,
        href:
          typeof recordId === 'string' && recordId.length > 0
            ? hrefForPage(recordId, op.collection)
            : null,
        ops: [],
      };
      groups.set(key, group);
      order.push(key);
    }
    group.ops.push(op);
  }

  return order.flatMap((key) => {
    const group = groups.get(key);
    return group ? [group] : [];
  });
}

/** Summarize unique pages + databases touched by ops (for list subtitles). */
export function summarizePagesTouched(
  ops: ReadonlyArray<{ collection: string; recordId?: string | null }>,
): { pageCount: number; databaseCount: number; label: string } {
  const pages = new Set<string>();
  const databases = new Set<string>();
  for (const op of ops) {
    databases.add(op.collection);
    pages.add(`${op.collection}:${op.recordId ?? 'new'}`);
  }
  const pageCount = pages.size;
  const databaseCount = databases.size;
  const pageLabel = pageCount === 1 ? '1 page' : `${pageCount} pages`;
  const dbLabel =
    databaseCount === 1 ? '1 database' : `${databaseCount} databases`;
  return {
    pageCount,
    databaseCount,
    label: `${pageLabel} across ${dbLabel}`,
  };
}

export interface OpenChangeRequestRef {
  id: string;
  title: string | null;
}

/**
 * Filter open change sets to those with at least one op on this page.
 * Client-side first pass over the existing Inbox list payload.
 */
export function changeRequestsTouchingPage(
  changeSets: ReadonlyArray<{
    id: string;
    title: string | null;
    operations: ReadonlyArray<{
      collection: string;
      recordId?: string | null;
    }>;
  }>,
  collection: string,
  pageId: string,
): OpenChangeRequestRef[] {
  const matches: OpenChangeRequestRef[] = [];
  for (const changeSet of changeSets) {
    const touches = changeSet.operations.some(
      (op) => op.collection === collection && op.recordId === pageId,
    );
    if (touches) {
      matches.push({ id: changeSet.id, title: changeSet.title });
    }
  }
  return matches;
}
