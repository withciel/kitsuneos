import { redirect } from 'next/navigation';
import { WorkspaceHomeEmpty } from '@/components/shell/workspace-home-empty';
import { loadWorkspaceSession } from '@/lib/server/load-workspace-session';

export default async function WorkspaceHomePage() {
  const snapshot = await loadWorkspaceSession();

  if (snapshot.unauthorized) {
    redirect('/login');
  }

  if (snapshot.error && !snapshot.schema) {
    return (
      <WorkspaceHomeEmpty
        kind="error"
        message={
          snapshot.error ??
          'Could not load your workspace. Refresh or sign in again.'
        }
      />
    );
  }

  const collections = snapshot.schema?.collections ?? [];
  if (collections.length > 0) {
    const first = collections[0]?.name;
    if (first) {
      redirect(`/c/${first}`);
    }
  }

  return (
    <WorkspaceHomeEmpty
      kind="empty"
      memberOnly={
        snapshot.me?.role === 'member' || snapshot.me?.role === 'viewer'
      }
    />
  );
}
