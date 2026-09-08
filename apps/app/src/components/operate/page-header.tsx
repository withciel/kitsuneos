import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Shared Operate page chrome: title, support copy, optional actions. */
export function OperatePageHeader({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-border px-6 py-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
