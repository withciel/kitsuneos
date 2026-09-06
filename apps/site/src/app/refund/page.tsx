import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = pageMetadata(
  'Refund Policy',
  'Refund terms for paid KitsuneOS Pro subscriptions.',
  '/refund/',
);

export default function RefundPage() {
  return (
    <main className="legal">
      <h1>Refund Policy</h1>
      <p>Last updated: September 2026</p>
      <p>
        Paid subscriptions may be refunded within 14 days of purchase if you
        have not materially used the product. Contact{' '}
        <a href="mailto:support@kitsuneos.com">support@kitsuneos.com</a> with
        your workspace email.
      </p>
      <p>
        After 14 days, refunds are at our discretion. Cancelling stops future
        charges; access continues through the paid period.
      </p>
      <p>
        <Link href="/">← Back home</Link>
      </p>
    </main>
  );
}
