import type { Metadata } from 'next';
import { SITE_ORIGIN } from './urls';

const defaultTitle = 'KitsuneOS — Knowledge warehouse for AI-native companies';
const defaultDescription =
  'The permissioned store of company knowledge and state that agents propose changes into, humans approve, and every write is attributed.';

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: defaultTitle,
    template: '%s — KitsuneOS',
  },
  description: defaultDescription,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_ORIGIN,
    siteName: 'KitsuneOS',
    title: defaultTitle,
    description: defaultDescription,
    images: [
      { url: '/og-image.png', width: 1200, height: 630, alt: 'KitsuneOS' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultTitle,
    description: defaultDescription,
    images: ['/og-image.png'],
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export function pageMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} — KitsuneOS`,
      description,
      url: path,
    },
    twitter: {
      title: `${title} — KitsuneOS`,
      description,
    },
  };
}
