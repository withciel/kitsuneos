import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = pageMetadata(
  'Terms of Service',
  'Terms for KitsuneOS — the knowledge home for AI-native companies.',
  '/terms/',
);

export default function TermsPage() {
  return (
    <main className="legal">
      <h1>Terms of Service</h1>
      <p>Last updated: September 2026</p>

      <h2>Service</h2>
      <p>
        KitsuneOS is available to everyone with a free tier and paid Pro plans.
        Free workspaces are subject to published usage limits (workspaces,
        people, agents, databases, storage, and agent operations). Paid plans
        unlock higher limits via Dodo Payments. The hosted service may still
        change as we improve it; we will communicate material limit or pricing
        changes in advance when practical.
      </p>

      <h2>How Ciel uses KitsuneOS</h2>
      <p>
        Ciel uses KitsuneOS for its own work. That internal use does not change
        the terms that apply to the hosted product at app.kitsuneos.com.
      </p>

      <h2>Security</h2>
      <p>
        KitsuneOS has not undergone an independent security review. Evaluate
        suitability for your workloads carefully and contact us for enterprise
        requirements.
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
