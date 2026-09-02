import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page">
      <h1>KitsuneOS Console</h1>
      <p>Agents propose. You approve.</p>
      <nav>
        <Link href="/review">Open review queue</Link>
      </nav>
    </main>
  );
}
