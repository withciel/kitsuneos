import type {
  CollectionDefinition,
  JsonValue,
  KitsuneEngine,
  ProposeChangeSetInput,
  QueryRequest,
  ReviewDecision,
} from '@kitsuneos/core';

export interface McpContext {
  workspaceId: string;
  principalId: string;
}

export function createMcpHandlers(
  engine: KitsuneEngine,
  getContext: () => McpContext,
) {
  return {
    async describe_schema() {
      const ctx = getContext();
      return engine.describeSchema(ctx.workspaceId, ctx.principalId);
    },

    async query(args: QueryRequest) {
      const ctx = getContext();
      return engine.query(ctx.workspaceId, ctx.principalId, args);
    },

    async read_record(args: {
      collection: string;
      recordId: string;
      fields?: string[];
    }) {
      const ctx = getContext();
      return engine.readRecord(
        ctx.workspaceId,
        ctx.principalId,
        args.collection,
        args.recordId,
        args.fields,
      );
    },

    async search(args: {
      query: string;
      collections?: string[];
      limit?: number;
    }) {
      const ctx = getContext();
      return engine.search(ctx.workspaceId, ctx.principalId, args);
    },

    async read_related(args: { collection: string; recordId: string }) {
      const ctx = getContext();
      return engine.listRelated(
        ctx.workspaceId,
        ctx.principalId,
        args.collection,
        args.recordId,
      );
    },

    async ls(args: { path: string }) {
      const ctx = getContext();
      return engine.vfsList(ctx.workspaceId, ctx.principalId, args.path);
    },

    async read(args: { path: string }) {
      const ctx = getContext();
      return engine.vfsRead(ctx.workspaceId, ctx.principalId, args.path);
    },

    async ingest(args: {
      collection: string;
      records: Array<{ id?: string; fields: Record<string, JsonValue> }>;
      mode?: 'auto' | 'propose' | 'direct';
    }) {
      const ctx = getContext();
      return engine.ingest(ctx.workspaceId, ctx.principalId, args);
    },

    async put_attachment(args: {
      collection: string;
      recordId: string;
      fieldName: string;
      contentType: string;
      contentBase64: string;
      fileName?: string;
    }) {
      const ctx = getContext();
      return engine.putAttachment(ctx.workspaceId, ctx.principalId, args);
    },

    async list_attachments(args: {
      collection: string;
      recordId: string;
      fieldName?: string;
    }) {
      const ctx = getContext();
      return engine.listAttachments(ctx.workspaceId, ctx.principalId, args);
    },

    async get_attachment(args: { attachmentId: string }) {
      const ctx = getContext();
      return engine.getAttachment(
        ctx.workspaceId,
        ctx.principalId,
        args.attachmentId,
      );
    },

    async create_webhook_endpoint(args: { url: string; events?: string[] }) {
      const ctx = getContext();
      return engine.createWebhookEndpoint(
        ctx.workspaceId,
        ctx.principalId,
        args,
      );
    },

    async list_webhook_endpoints() {
      const ctx = getContext();
      return engine.listWebhookEndpoints(ctx.workspaceId, ctx.principalId);
    },

    async delete_webhook_endpoint(args: { endpointId: string }) {
      const ctx = getContext();
      await engine.deleteWebhookEndpoint(
        ctx.workspaceId,
        ctx.principalId,
        args.endpointId,
      );
      return { ok: true };
    },

    async enqueue_merge(args: { changeSetId: string }) {
      const ctx = getContext();
      return engine.enqueueMerge(
        ctx.workspaceId,
        ctx.principalId,
        args.changeSetId,
      );
    },

    async list_merge_queue(args: {
      statuses?: Array<
        'pending' | 'processing' | 'applied' | 'blocked' | 'cancelled'
      >;
    }) {
      const ctx = getContext();
      return engine.listMergeQueue(ctx.workspaceId, ctx.principalId, {
        statuses: args.statuses,
      });
    },

    async process_merge_queue(args: { limit?: number }) {
      const ctx = getContext();
      return engine.processMergeQueue(ctx.workspaceId, ctx.principalId, {
        limit: args.limit,
      });
    },

    async create_branch(args: { name: string }) {
      const ctx = getContext();
      return engine.createBranch(ctx.workspaceId, ctx.principalId, {
        name: args.name,
      });
    },

    async list_branches() {
      const ctx = getContext();
      return engine.listBranches(ctx.workspaceId, ctx.principalId);
    },

    async propose_change_set(args: ProposeChangeSetInput) {
      const ctx = getContext();
      return engine.proposeChangeSet(ctx.workspaceId, ctx.principalId, args);
    },

    async read_change_set_feedback(args: { changeSetId: string }) {
      const ctx = getContext();
      return engine.readChangeSetFeedback(
        ctx.workspaceId,
        ctx.principalId,
        args.changeSetId,
      );
    },

    async review_change_set(args: {
      changeSetId: string;
      decisions: ReviewDecision[];
    }) {
      const ctx = getContext();
      await engine.reviewChangeSet(
        ctx.workspaceId,
        ctx.principalId,
        args.changeSetId,
        args.decisions,
      );
      return { ok: true };
    },

    async apply_change_set(args: { changeSetId: string }) {
      const ctx = getContext();
      return engine.applyChangeSet(
        ctx.workspaceId,
        ctx.principalId,
        args.changeSetId,
      );
    },

    async define_collection(args: CollectionDefinition) {
      const ctx = getContext();
      const collectionId = await engine.defineCollection(ctx.workspaceId, args);
      return { collectionId };
    },
  };
}

export type McpHandlers = ReturnType<typeof createMcpHandlers>;

export function parseJsonArgs(raw: unknown): Record<string, JsonValue> {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as Record<string, JsonValue>;
  }
  if (raw && typeof raw === 'object') {
    return raw as Record<string, JsonValue>;
  }
  return {};
}
