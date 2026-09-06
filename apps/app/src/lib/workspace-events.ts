export const WORKSPACE_CHANGED_EVENT = 'kitsune:workspace-changed';
export const OPEN_COMMAND_PALETTE_EVENT = 'kitsune:open-command-palette';

export function notifyWorkspaceChanged(): void {
  window.dispatchEvent(new Event(WORKSPACE_CHANGED_EVENT));
}

export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}
