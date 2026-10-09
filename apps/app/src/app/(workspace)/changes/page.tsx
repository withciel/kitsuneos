import { loadChangesLists } from '@/lib/server/load-list-pages';
import ChangesPage from './changes-client';

export default async function ChangesRoute() {
  let items: Array<{
    id: string;
    title: string | null;
    rationale: string | null;
    status: string;
    createdAt: string;
    author: string;
    operations: Array<{ collection: string; recordId?: string | null }>;
  }> = [];
  try {
    const lists = await loadChangesLists();
    items = [...lists.open, ...lists.closed];
  } catch {
    items = [];
  }
  return <ChangesPage initialItems={items} />;
}
