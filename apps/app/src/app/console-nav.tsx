import Link from 'next/link';

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
  return (
    <nav className="console-nav" aria-label="Console">
      {LINKS.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? ' · ' : null}
          <Link href={link.href}>{link.label}</Link>
        </span>
      ))}
    </nav>
  );
}
