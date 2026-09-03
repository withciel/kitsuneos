'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/schema', label: 'Schema' },
  { href: '/query', label: 'Query' },
  { href: '/review', label: 'Review' },
  { href: '/grants', label: 'Grants' },
  { href: '/audit', label: 'Audit' },
  { href: '/history', label: 'History' },
] as const;

export function ConsoleNav() {
  const pathname = usePathname();

  return (
    <nav className="console-nav" aria-label="Console">
      {LINKS.map((link) => {
        const current =
          link.href === '/'
            ? pathname === '/'
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? 'page' : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
