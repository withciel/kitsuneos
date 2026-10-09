export type {
  AssistantCollectionGrantSpec,
  QuickstartAssistantOpportunityField,
} from './assistant-grants.js';
export {
  defaultAssistantGrantForCollection,
  ensureAssistantGrantsForWorkspace,
  QUICKSTART_ASSISTANT_FORBIDDEN_COLLECTIONS,
} from './assistant-grants.js';
export {
  type AgentMembership,
  createAgentViaWorkOS,
} from './create-agent-workos.js';
export { type InviteRole, invitePersonViaWorkOS } from './invite-workos.js';
export type {
  CreateAdditionalWorkspaceInput,
  CreateAdditionalWorkspaceResult,
  ProvisionUserInput,
  ProvisionUserResult,
} from './provision-workspace.js';
export {
  createAdditionalWorkspaceForUser,
  provisionUserWorkspace,
} from './provision-workspace.js';
export type { StarterCollectionIds } from './seed-collections.js';
export {
  defineStarterCollections,
  ensureNotesCollection,
  grantAssistantOnStarters,
  grantOwnerOnStarters,
  NOTES_COLLECTION,
  NOTES_DEFINITION,
  POSTS_COLLECTION,
  POSTS_DEFINITION,
  QUICKSTART_ASSISTANT_OPPORTUNITY_FIELDS,
} from './seed-collections.js';
export { syncWorkspaceToWorkOS } from './sync-workos.js';
