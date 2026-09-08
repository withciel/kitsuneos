'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { SETTINGS_TABS } from '@/lib/settings-tabs';
import {
  SHELL_CONTEXT_EVENT,
  type ShellContextState,
  type ShellCrumb,
} from '@/lib/shell-context';
import { cn } from '@/lib/utils';
import { openCommandPalette } from '@/lib/workspace-events';

function crumbsFromPath(pathname: string): {
  crumbs: ShellCrumb[];
  title: string;
} {
  if (!pathname || pathname === '/') {
    return { crumbs: [], title: 'Home' };
  }

  const segments = pathname.split('/').filter(Boolean);
  const [root, second] = segments;

  if (root === 'c' && second) {
    return {
      crumbs: [{ label: 'Databases', href: '/' }],
      title: second,
    };
  }
  if (root === 'p' && second) {
    return {
      crumbs: [{ label: 'Page' }],
      title: 'Page',
    };
  }
  if (root === 'changes') {
    if (second) {
      return {
        crumbs: [{ label: 'Changes', href: '/changes' }],
        title: 'Change request',
      };
    }
    return { crumbs: [], title: 'Changes' };
  }
  if (root === 'inbox') {
    if (second) {
      return {
        crumbs: [{ label: 'Changes', href: '/changes' }],
        title: 'Change request',
      };
    }
    return { crumbs: [], title: 'Changes' };
  }
  if (root === 'agents') {
    if (second) {
      return {
        crumbs: [{ label: 'Agents', href: '/agents' }],
        title: 'Agent',
      };
    }
    return { crumbs: [], title: 'Agents' };
  }
  if (root === 'graph') {
    return { crumbs: [], title: 'Graph' };
  }
  if (root === 'settings') {
    const tab = SETTINGS_TABS.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    );
    return {
      crumbs: [{ label: 'Settings', href: '/settings' }],
      title: tab?.label ?? 'Settings',
    };
  }

  return {
    crumbs: [],
    title: root ? root.charAt(0).toUpperCase() + root.slice(1) : 'Workspace',
  };
}

export function ShellHeader() {
  const pathname = usePathname() ?? '/';
  const fallback = useMemo(() => crumbsFromPath(pathname), [pathname]);
  const [override, setOverride] = useState<ShellContextState | null>(null);

  useEffect(() => {
    if (!pathname) return;
    setOverride(null);
  }, [pathname]);

  useEffect(() => {
    function onContext(event: Event) {
      const custom = event as CustomEvent<ShellContextState | null>;
      setOverride(custom.detail);
    }
    window.addEventListener(SHELL_CONTEXT_EVENT, onContext);
    return () => window.removeEventListener(SHELL_CONTEXT_EVENT, onContext);
  }, []);

  const title = override?.title?.trim() || fallback.title;
  const crumbs =
    override?.crumbs && override.crumbs.length > 0
      ? override.crumbs
      : fallback.crumbs;

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <nav
        aria-label="Location"
        className="operate-enter-fast flex min-w-0 flex-1 items-center gap-1.5 text-sm"
        key={`${pathname}:${title}`}
      >
        {crumbs.map((crumb) => (
          <span
            key={`${crumb.label}:${crumb.href ?? ''}`}
            className="flex min-w-0 items-center gap-1.5"
          >
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="truncate text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate text-muted-foreground">
                {crumb.label}
              </span>
            )}
            <span className="text-muted-foreground/60" aria-hidden="true">
              /
            </span>
          </span>
        ))}
        <span className="truncate font-medium tracking-tight text-foreground">
          {title}
        </span>
      </nav>
      <button
        type="button"
        className={cn(
          'ml-auto hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground',
          'transition-colors hover:bg-accent hover:text-accent-foreground sm:inline-flex',
        )}
        onClick={() => openCommandPalette()}
      >
        Search
        <kbd className="rounded border border-border bg-muted/40 px-1 text-[10px]">
          ⌘K
        </kbd>
      </button>
    </header>
  );
}
