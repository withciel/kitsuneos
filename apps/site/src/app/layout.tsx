import type { Metadata } from 'next';
import { Fraunces, IBM_Plex_Mono, Outfit } from 'next/font/google';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import './globals.css';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const sans = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'KitsuneOS — Agents propose. You approve.',
  description:
    'A database layer where agents propose changes and humans approve them.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body
        style={
          {
            '--k-font-display': 'var(--font-fraunces), serif',
            '--k-font-sans': 'var(--font-outfit), system-ui, sans-serif',
            '--k-font-mono':
              'var(--font-ibm-plex-mono), ui-monospace, monospace',
          } as CSSProperties
        }
      >
        <div className="site-shell">
          <header className="site-header">
            <Link className="site-logo" href="/">
              Kitsune<span>OS</span>
            </Link>
            <nav aria-label="Account">
              <a className="site-signin" href="[REDACTED]">
                Sign in
              </a>
            </nav>
          </header>
          {children}
          <footer className="site-footer">
            <nav aria-label="Legal and support">
              <Link href="/terms/">Terms</Link>
              <Link href="/privacy/">Privacy</Link>
              <Link href="/refund/">Refunds</Link>
              <a href="mailto:support@kitsuneos.com">support@kitsuneos.com</a>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
