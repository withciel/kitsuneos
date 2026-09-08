'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type UnderlineTabItem = {
  id: string;
  label: ReactNode;
  href?: string;
  count?: number;
};

/** Shared underline tab strip (Settings language) for Operate surfaces. */
export function UnderlineTabs({
  items,
  activeId,
  onSelect,
  ariaLabel,
  className,
}: {
  items: UnderlineTabItem[];
  activeId: string;
  onSelect?: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <nav
      className={cn('mt-3 flex flex-wrap gap-4', className)}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        const classNameTab = cn(
          'border-b-2 pb-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        );
        const label = (
          <>
            {item.label}
            {item.count !== undefined ? (
              <span className="ml-1.5 text-muted-foreground">
                ({item.count})
              </span>
            ) : null}
          </>
        );
        if (item.href) {
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={classNameTab}
            >
              {label}
            </Link>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            className={classNameTab}
            onClick={() => onSelect?.(item.id)}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}
