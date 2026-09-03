import type { Metadata } from 'next';
import { Fraunces, IBM_Plex_Mono, Outfit } from 'next/font/google';
import type { CSSProperties, ReactNode } from 'react';
import '@kitsuneos/ui/styles.css';
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
  title: 'KitsuneOS Console',
  description: 'Review agent-proposed changes before they land.',
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
        {children}
      </body>
    </html>
  );
}
