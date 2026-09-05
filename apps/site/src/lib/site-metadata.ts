import type { Metadata } from 'next';
import { SITE_ORIGIN } from './urls';

const defaultTitle = 'KitsuneOS — Everything your company knows, close at hand';
const defaultDescription =
  'KitsuneOS is the knowledge home for AI-native companies — where what you know lives, stays close, and is easy to find while your helpers keep working.';

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
      {
        url: '/kitsune-agents-ad-poster.jpg',
        width: 1280,
        height: 720,
        alt: 'KitsuneOS — company knowledge, close at hand',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultTitle,
    description: defaultDescription,
    images: ['/kitsune-agents-ad-poster.jpg'],
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
