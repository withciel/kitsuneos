import { DEMO } from './demo.js';

export interface CliWorkspace {
  workspaceId: string;
  principalId: string;
}

export function resolveCliWorkspace(): CliWorkspace {
  return {
    workspaceId: process.env.KITSUNE_WORKSPACE_ID ?? DEMO.workspaceId,
    principalId: process.env.KITSUNE_PRINCIPAL_ID ?? DEMO.ownerId,
  };
}
