'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function WorkspaceHomePage() {
  const router = useRouter();
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    void fetch('/api/schema')
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (!response.ok) {
          setEmpty(true);
          return;
        }
        const body = (await response.json()) as {
          collections?: Array<{ name: string }>;
        };
        const first = body.collections?.[0]?.name;
        if (first) {
          router.replace(`/c/${first}`);
        } else {
          setEmpty(true);
        }
      })
      .catch(() => setEmpty(true));
  }, [router]);

  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-start gap-3 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          No collections yet. Open Settings to define a collection.
        </p>
        <a
          href="/settings"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
