import { Fraunces, IBM_Plex_Mono, Outfit } from 'next/font/google';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { siteMetadata } from '@/lib/site-metadata';
import { signInUrl, signUpUrl } from '@/lib/urls';
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

export const metadata = siteMetadata;

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
            <nav className="site-header-nav" aria-label="Primary">
              <a href="/#how">Product</a>
              <a href="/#proof">Proof</a>
              <a href="/#trust">Security</a>
              <a href="/#pricing">Pricing</a>
              <a className="site-signin" href={signInUrl}>
                Sign in
              </a>
              <a className="site-cta" href={signUpUrl}>
                Start free
              </a>
            </nav>
          </header>
          {children}
          <footer className="site-footer">
            <nav aria-label="Legal and support">
              <Link href="/terms/">Terms</Link>
              <Link href="/privacy/">Privacy</Link>
              <Link href="/refund/">Refunds</Link>
              <a href="https://github.com/withciel/kitsuneos">GitHub</a>
              <a href="mailto:support@kitsuneos.com">support@kitsuneos.com</a>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
