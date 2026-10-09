import { redirect } from 'next/navigation';
import { WorkspaceShell } from '@/components/shell/workspace-shell';
import { loadWorkspaceSession } from '@/lib/server/load-workspace-session';
import { readSidebarPrefs } from '@/lib/server/sidebar-prefs';

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [initialSnapshot, initialSidebarPrefs] = await Promise.all([
    loadWorkspaceSession(),
    readSidebarPrefs(),
  ]);

  if (initialSnapshot.unauthorized) {
    redirect('/login');
  }

  return (
    <WorkspaceShell
      initialSnapshot={initialSnapshot}
      initialSidebarPrefs={initialSidebarPrefs}
    >
      {children}
    </WorkspaceShell>
  );
}
