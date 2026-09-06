export type {
  CreateAdditionalWorkspaceInput,
  CreateAdditionalWorkspaceResult,
  ProvisionUserInput,
  ProvisionUserResult,
} from './provision-workspace.js';
export {
  createAdditionalWorkspaceForUser,
  ensureNotesCollection,
  NOTES_COLLECTION,
  NOTES_DEFINITION,
  provisionUserWorkspace,
} from './provision-workspace.js';
export type { StarterCollectionIds } from './seed-collections.js';
export {
  defineStarterCollections,
  grantAssistantOnStarters,
  grantOwnerOnStarters,
} from './seed-collections.js';
