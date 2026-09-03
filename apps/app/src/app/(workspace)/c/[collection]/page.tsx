import { CollectionView } from '@/components/collection/collection-view';

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ collection: string }>;
}) {
  const { collection } = await params;
  return <CollectionView collection={collection} />;
}
