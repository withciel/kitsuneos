import { Suspense } from 'react';
import HomeContent from './home-content';

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <p>Loading…</p>
        </main>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
