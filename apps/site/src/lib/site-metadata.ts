import type { Metadata } from 'next';
import { SITE_METADATA } from './landing-copy';
import { SITE_ORIGIN } from './urls';

const { defaultTitle, defaultDescription } = SITE_METADATA;

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: defaultTitle,
    template: SITE_METADATA.titleTemplate,
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
        alt: SITE_METADATA.ogImageAlt,
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
  const fullTitle = SITE_METADATA.titleTemplate.replace('%s', title);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: fullTitle,
      description,
      url: path,
    },
    twitter: {
      title: fullTitle,
      description,
    },
  };
}
