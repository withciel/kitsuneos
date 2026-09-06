'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SETTINGS_TABS } from '@/lib/settings-tabs';
import { cn } from '@/lib/utils';

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <div className="border-b border-border px-6 pt-4">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Workspace account, billing, people, access, webhooks, and AI
        connections.
      </p>
      <nav className="mt-3 flex flex-wrap gap-4" aria-label="Settings">
        {SETTINGS_TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'border-b-2 pb-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
