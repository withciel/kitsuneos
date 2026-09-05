export type { BlobStore } from './attachments/blob-store.js';
export {
  createDefaultBlobStore,
  LocalFilesystemBlobStore,
  sha256Hex,
} from './attachments/blob-store.js';
export type {
  AttachmentMeta,
  PutAttachmentInput,
} from './attachments/types.js';
export type { ResolvedApiKey } from './auth/api-keys.js';
export {
  apiKeyDisplayPrefix,
  createApiKey,
  generateApiKeyPlaintext,
  hashApiKeyForAudit,
  resolveApiKey,
  revokeApiKey,
} from './auth/api-keys.js';
export type { SubscriptionStatus } from './billing/entitlement.js';
export {
  assertWriteEntitlement,
  loadWorkspaceSubscriptionStatus,
  statusGrantsWrite,
} from './billing/entitlement.js';
export type {
  ProcessSubscriptionWebhookInput,
  SubscriptionWebhookResult,
} from './billing/store.js';
export {
  findWorkspaceByDodoCustomer,
  processSubscriptionWebhook,
  recordBillingEvent,
  recordUsageEvent,
  upsertSubscription,
} from './billing/store.js';
export { migrate } from './cli/migrate.js';
export { compilePredicate } from './compiler/predicate-sql.js';
export {
  compileQuery,
  compileReadRecord,
  getCollectionMeta,
} from './compiler/query.js';
export { createPools, setSessionContext } from './db/pool.js';
export {
  generateCollectionDdl,
  generateEmbeddingDdl,
  generateWorkspaceSchemaDdl,
} from './ddl/generator.js';
export type { ApplyFaultInjection, EngineOptions } from './engine.js';
export { DEFAULT_CONFIG, KitsuneEngine } from './engine.js';
export {
  assertFieldAllowed,
  loadResolvedGrant,
  projectFields,
  resolveGrantRows,
} from './grants/resolve.js';
export type {
  IngestRecord,
  IngestRequest,
  IngestResult,
  IngestSourceKind,
  ParsedIngestBatch,
} from './ingest/types.js';
export {
  type SweepCollectionResult,
  type SweepRevisionsResult,
  sweepExpiredRevisions,
} from './revisions/sweep.js';
export {
  getChangedFieldsSince,
  getRevisionAtTime,
  getRevisionSnapshot,
  writeRevision,
} from './revisions/write.js';
export {
  assertIdentifier,
  validateCollectionDefinition,
  validateFieldDefinition,
} from './schema/validate-definition.js';
export {
  DeterministicEmbedder,
  EMBEDDING_DIMENSIONS,
  type Embedder,
  vectorLiteral,
} from './search/embedder.js';
export {
  createDefaultEmbedder,
  OpenAIEmbedder,
  type OpenAIEmbedderOptions,
} from './search/openai-embedder.js';
export type { RelatedNeighbor, RelatedResult } from './search/related.js';
export type {
  SearchHit,
  SearchRequest,
  SearchResult,
} from './search/search.js';
export * from './types.js';
export {
  fieldFileName,
  parseVfsPath,
  serializeField,
  type VfsListEntry,
  type VfsListResult,
  type VfsPath,
  type VfsReadResult,
} from './vfs/paths.js';
