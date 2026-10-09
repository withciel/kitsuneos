import { loadGraphPage } from '@/lib/server/load-list-pages';
import GraphPage from './graph-client';

export default async function GraphRoute() {
  try {
    const data = await loadGraphPage();
    return <GraphPage initialNodes={data.nodes} initialEdges={data.edges} />;
  } catch {
    return <GraphPage />;
  }
}
