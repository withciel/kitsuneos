'use client';

import { Badge } from '@/components/ui/badge';
import type { PageGroupOp, PageOpGroup } from '@/lib/group-ops-by-page';

function shortId(id: string | null | undefined): string {
  if (!id) return 'new page';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/**
 * Left rail of the PR shell: pages touched by this change request,
 * GitHub "Files changed" tree style. Clicking scrolls the center diff
 * to that page's section.
 */
export function FileTree<T extends PageGroupOp>({
  groups,
  decisions,
}: {
  groups: PageOpGroup<T>[];
  decisions: Record<string, 'approved' | 'rejected'>;
}) {
  return (
    <nav className="space-y-1 p-3">
      <p className="mb-2 px-1 text-xs font-medium uppercase text-muted-foreground">
        Pages changed ({groups.length})
      </p>
      <ul className="space-y-1">
        {groups.map((group) => {
          const decided = group.ops.filter((op) => decisions[op.id]).length;
          return (
            <li key={group.key}>
              <a
                href={`#page-${group.key}`}
                className="flex flex-col gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span className="flex items-center gap-2">
                  <Badge variant="secondary" className="shrink-0">
                    {group.collection}
                  </Badge>
                  <span className="truncate font-medium">
                    {group.recordId ? shortId(group.recordId) : 'New page'}
                  </span>
                </span>
                <span className="pl-1 text-xs text-muted-foreground">
                  {group.ops.length}{' '}
                  {group.ops.length === 1 ? 'change' : 'changes'}
                  {decided > 0 ? ` · ${decided} decided` : ''}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
