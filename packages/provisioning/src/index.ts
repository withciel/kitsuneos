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
} from './seed-collections.js';
