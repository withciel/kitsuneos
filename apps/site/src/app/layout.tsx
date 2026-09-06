import { Fraunces, Outfit } from 'next/font/google';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { siteMetadata } from '@/lib/site-metadata';
import { contactMailto, signInUrl, signUpUrl } from '@/lib/urls';
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

export const metadata = siteMetadata;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body
        style={
          {
            '--k-font-display': 'var(--font-fraunces), Georgia, serif',
            '--k-font-sans': 'var(--font-outfit), system-ui, sans-serif',
          } as CSSProperties
        }
      >
        <div className="site-shell">
          <header className="site-header">
            <Link className="site-logo" href="/">
              Kitsune<span>OS</span>
            </Link>
            <nav className="site-header-nav" aria-label="Primary">
              <a href="/#problem">Why</a>
              <a href="/#how">How it works</a>
              <a className="site-signin" href={signInUrl}>
                Sign in
              </a>
              <a className="site-cta" href={signUpUrl}>
                Get early access
              </a>
            </nav>
          </header>
          {children}
          <footer className="site-footer">
            <p className="site-built">
              Built by{' '}
              <a href="https://withciel.com" rel="noopener noreferrer">
                Ciel
              </a>
              — the data layer under their own work.
            </p>
            <nav aria-label="Legal and support">
              <Link href="/terms/">Terms</Link>
              <Link href="/privacy/">Privacy</Link>
              <Link href="/refund/">Refunds</Link>
              <a href={contactMailto}>support@kitsuneos.com</a>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
