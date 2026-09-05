import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = pageMetadata(
  'Terms of Service',
  'Early access terms for KitsuneOS — the knowledge home for AI-native companies.',
  '/terms/',
);

export default function TermsPage() {
  return (
    <main className="legal">
      <h1>Terms of Service</h1>
      <p>Last updated: September 2026</p>

      <h2>Early access</h2>
      <p>
        KitsuneOS is in early access. The product may change as we learn. We do
        not guarantee uptime or data retention during this period. The hosted
        service is intended for evaluation and non-production work until we
        announce general availability.
      </p>

      <h2>How Ciel uses KitsuneOS</h2>
      <p>
        Ciel uses KitsuneOS for its own work. That internal use does not change
        the early-access status of the hosted product at app.kitsuneos.com,
        which remains under these Terms until general availability.
      </p>

      <h2>Security</h2>
      <p>
        KitsuneOS has not undergone an independent security review. Use at your
        own risk for non-production workloads until we announce general
        availability.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these Terms. Continued use after a change means you accept
        the updated Terms. Questions:{' '}
        <a href="mailto:support@kitsuneos.com">support@kitsuneos.com</a>.
      </p>

      <p>
        <Link href="/">← Back home</Link>
      </p>
    </main>
  );
}
