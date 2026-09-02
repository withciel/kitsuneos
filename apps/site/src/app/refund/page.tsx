import Link from 'next/link';

export default function RefundPage() {
  return (
    <main className="legal">
      <h1>Refund Policy</h1>
      <p>Last updated: September 2026</p>
      <p>
        Paid subscriptions may be refunded within 14 days of purchase if you
        have not materially used write access (proposals, applies, schema
        changes). Contact{' '}
        <a href="mailto:support@kitsuneos.com">support@kitsuneos.com</a> with
        your workspace email.
      </p>
      <p>
        After 14 days, refunds are at our discretion. Cancelling stops future
        charges; access continues through the paid period.
      </p>
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
