import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Shared page-level loading skeleton. */
export function OperateLoadingBlock({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  const rowCount = Math.max(0, Math.min(rows, 6));
  return (
    <div className={cn('space-y-2 px-6 py-4', className)}>
      <Skeleton className="h-8 w-48" />
      {rowCount >= 1 ? <Skeleton className="h-10 w-full" /> : null}
      {rowCount >= 2 ? <Skeleton className="h-10 w-full" /> : null}
      {rowCount >= 3 ? <Skeleton className="h-10 w-full" /> : null}
      {rowCount >= 4 ? <Skeleton className="h-10 w-full" /> : null}
      {rowCount >= 5 ? <Skeleton className="h-10 w-full" /> : null}
      {rowCount >= 6 ? <Skeleton className="h-10 w-full" /> : null}
    </div>
  );
}
