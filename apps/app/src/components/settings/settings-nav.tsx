'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/settings/schema', label: 'Schema' },
  { href: '/settings/grants', label: 'Grants' },
  { href: '/settings/workspace', label: 'Workspace' },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <div className="border-b border-border px-6 pt-4">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <nav className="mt-3 flex gap-4">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'border-b-2 pb-2 text-sm',
              pathname === tab.href
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
