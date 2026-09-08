import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Product empty state — title, support copy, optional CTA. No dashed boxes. */
export function OperateEmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'operate-enter mx-auto flex max-w-md flex-col items-start gap-4 py-10',
        className,
      )}
    >
      <div className="space-y-2">
        <p className="text-sm font-medium tracking-tight">{title}</p>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
