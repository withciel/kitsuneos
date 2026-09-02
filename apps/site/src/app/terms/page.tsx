import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="legal">
      <h1>Terms of Service</h1>
      <p>Last updated: September 2026</p>
      <h2>Early access</h2>
      <p>
        KitsuneOS is in early access. Features, APIs, and schemas may change
        without notice. We do not guarantee uptime or data retention during this
        period.
      </p>
      <h2>No security audit</h2>
      <p>
        KitsuneOS has not undergone an independent security audit. Use at your
        own risk for non-production workloads until we announce general
        availability.
      </p>
      <h2>Schema changes</h2>
      <p>
        v0.1 supports create-only schema definitions. Migration tooling is not
        yet available; plan accordingly.
      </p>
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
