'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/settings/schema', label: 'Databases' },
  { href: '/settings/access', label: 'Access' },
  { href: '/settings/connect', label: 'Connect AI' },
  { href: '/settings/workspace', label: 'Account' },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <div className="border-b border-border px-6 pt-4">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your databases, who can change what, and how AI helpers connect.
      </p>
      <nav className="mt-3 flex flex-wrap gap-4">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'border-b-2 pb-2 text-sm',
              pathname === tab.href || pathname.startsWith(`${tab.href}/`)
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
