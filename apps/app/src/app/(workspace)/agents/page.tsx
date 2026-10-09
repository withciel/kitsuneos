import { loadAgentsPage } from '@/lib/server/load-list-pages';
import AgentsPage from './agents-client';

export default async function AgentsRoute() {
  try {
    const data = await loadAgentsPage();
    return (
      <AgentsPage
        initialAgents={data.agents}
        initialTeams={data.teams}
        initialPrincipalId={data.myPrincipalId}
        initialIsAdmin={data.isAdmin}
      />
    );
  } catch {
    return <AgentsPage />;
  }
}
