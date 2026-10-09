import { notFound } from 'next/navigation';
import { PageView } from '@/components/page/page-view';
import { loadPageRecord } from '@/lib/server/load-page-record';

export default async function PageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { pageId } = await params;
  const { c: collection } = await searchParams;

  if (!collection?.trim()) {
    return (
      <div className="space-y-2 p-8">
        <h1 className="text-xl font-semibold tracking-tight">Page</h1>
        <p className="text-sm text-muted-foreground">
          Open a page from a database table so the collection is known (
          <code className="font-mono text-xs">/p/[pageId]?c=[collection]</code>
          ).
        </p>
      </div>
    );
  }

  const collectionName = collection.trim();
  let initialData = null;
  try {
    initialData = await loadPageRecord(collectionName, pageId);
  } catch {
    initialData = null;
  }
  if (!initialData) {
    notFound();
  }

  return (
    <PageView
      pageId={pageId}
      collection={collectionName}
      initialData={{
        fields: initialData.fields,
        capability: initialData.capability,
        row: initialData.row,
        draft: initialData.draft,
        relationOptions: initialData.relationOptions,
      }}
    />
  );
}
