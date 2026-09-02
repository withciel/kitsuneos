import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'KitsuneOS — Agents propose. You approve.',
  description:
    'A database layer where agents propose changes and humans approve them.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="site-footer">
          <nav aria-label="Legal and support">
            <Link href="/terms/">Terms</Link>
            {' · '}
            <Link href="/privacy/">Privacy</Link>
            {' · '}
            <Link href="/refund/">Refunds</Link>
            {' · '}
            <a href="mailto:support@kitsuneos.com">support@kitsuneos.com</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
