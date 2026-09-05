import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="not-found">
      <h1>Page not found</h1>
      <p>The page you requested does not exist.</p>
      <p>
        <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}
