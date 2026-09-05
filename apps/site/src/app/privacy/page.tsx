import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = pageMetadata(
  'Privacy Policy',
  'How KitsuneOS handles account data, workspace content, retention, and subprocessors.',
  '/privacy/',
);

export default function PrivacyPage() {
  return (
    <main className="legal">
      <h1>Privacy Policy</h1>
      <p>Last updated: September 2026</p>

      <h2>What we store</h2>
      <ul>
        <li>Account identity via WorkOS (email, WorkOS user id)</li>
        <li>
          Workspace data you create (collections, records, change sets, audit
          log)
        </li>
        <li>API key hashes (never plaintext after initial display)</li>
        <li>
          Billing status when you subscribe via Dodo Payments (subscription id,
          status, and plan metadata — not full card numbers)
        </li>
      </ul>

      <h2>Retention</h2>
      <p>
        Workspace data is retained while your account is active. After account
        deletion, we remove or anonymize personal identifiers within 30 days and
        delete workspace content within 90 days unless law requires longer
        retention.
      </p>

      <h2>Deletion</h2>
      <p>
        You may request account and workspace deletion by emailing{' '}
        <a href="mailto:support@kitsuneos.com">support@kitsuneos.com</a>. We
        will confirm by reply before purging data.
      </p>

      <h2>Subprocessors</h2>
      <ul>
        <li>WorkOS — authentication</li>
        <li>Dodo Payments — billing</li>
        <li>Amazon Web Services — hosting (RDS, App Runner, S3, CloudFront)</li>
      </ul>

      <p>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
