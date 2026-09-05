export const WORKSPACE_CHANGED_EVENT = 'kitsune:workspace-changed';

export function notifyWorkspaceChanged(): void {
  window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
}
