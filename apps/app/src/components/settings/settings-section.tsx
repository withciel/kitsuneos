import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Page-level heading used at the top of each Settings screen. */
export function SettingsPageHeader({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
          ) : null}
          <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        </div>
        {description ? (
          <p className="max-w-xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </div>
  );
}

/**
 * Grouped card used to break a Settings page into distinct, labeled steps
 * (e.g. "existing" vs. "add new") instead of one long wall of inline fields.
 */
export function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('space-y-4 rounded-lg border border-border p-5', className)}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Small inline callout linking to a related Settings screen. */
export function SettingsCallout({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      {Icon ? <Icon className="mt-0.5 size-3.5 shrink-0" /> : null}
      <p>{children}</p>
    </div>
  );
}
