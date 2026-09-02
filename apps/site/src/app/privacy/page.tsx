import Link from 'next/link';

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
        <li>Billing status when you subscribe via Dodo Payments</li>
      </ul>
      <h2>Retention</h2>
      <p>
        Workspace data is retained while your account is active. You may request
        deletion by contacting support@kitsuneos.com.
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
