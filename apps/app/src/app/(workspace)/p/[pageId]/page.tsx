import { PageView } from '@/components/page/page-view';

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

  return <PageView pageId={pageId} collection={collection.trim()} />;
}
