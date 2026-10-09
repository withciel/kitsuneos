import { notFound } from 'next/navigation';
import { CollectionView } from '@/components/collection/collection-view';
import { loadCollectionPage } from '@/lib/server/load-collection-page';

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collection: string }>;
}) {
  const { collection } = await params;
  let initialData = null;
  try {
    initialData = await loadCollectionPage(collection);
  } catch {
    initialData = null;
  }
  if (!initialData) {
    notFound();
  }

  return (
    <CollectionView
      collection={collection}
      initialData={{
        fields: initialData.fields,
        capability: initialData.capability,
        rows: initialData.rows,
        truncated: initialData.truncated,
        relationOptions: initialData.relationOptions,
        viewScope: initialData.viewScope,
        views: initialData.meta.views,
      }}
    />
  );
}
