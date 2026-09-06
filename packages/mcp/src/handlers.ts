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

    /** Supermemory-style: semantic recall across grant-visible workspace prose. */
    async memory_search(args: {
      query: string;
      collections?: string[];
      limit?: number;
    }) {
      const ctx = getContext();
      const result = await engine.search(
        ctx.workspaceId,
        ctx.principalId,
        args,
      );
      return {
        memories: result.hits.map((hit) => ({
          collection: hit.collection,
          recordId: hit.recordId,
          field: hit.fieldName,
          snippet: hit.excerpt,
          score: hit.score,
        })),
      };
    },

    async memory_get(args: {
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

    async memory_related(args: { collection: string; recordId: string }) {
      const ctx = getContext();
      return engine.listRelated(
        ctx.workspaceId,
        ctx.principalId,
        args.collection,
        args.recordId,
      );
    },

    async memory_remember(args: {
      collection?: string;
      title: string;
      body: string;
    }) {
      const ctx = getContext();
      const collection = args.collection ?? 'agent_memory';
      const schema = await engine.describeSchema(
        ctx.workspaceId,
        ctx.principalId,
      );
      const exists = schema.collections.some((c) => c.name === collection);
      if (!exists) {
        try {
          await engine.defineCollection(ctx.workspaceId, {
            name: collection,
            fields: [
              { name: 'title', type: 'text', nullable: false },
              { name: 'body', type: 'prose' },
            ],
          });
        } catch (error) {
          return {
            error:
              'agent_memory database is missing and this agent cannot create it. Ask a workspace admin to create an agent profile (Connect → Agent profiles) or grant define access.',
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }
      return engine.directWrite(ctx.workspaceId, ctx.principalId, collection, {
        title: args.title,
        body: args.body,
      });
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

    async link_principal_identity(args: {
      principalId: string;
      externalIssuer: string;
      externalSubject: string;
    }) {
      const ctx = getContext();
      await engine.linkPrincipalIdentity(
        ctx.workspaceId,
        ctx.principalId,
        args,
      );
      return { ok: true };
    },

    async resolve_principal_identity(args: {
      externalIssuer: string;
      externalSubject: string;
    }) {
      const ctx = getContext();
      // Admin gate: listBranches throws not_found for non-admins.
      await engine.listBranches(ctx.workspaceId, ctx.principalId);
      return engine.resolvePrincipalsByExternalSubject(
        args.externalIssuer,
        args.externalSubject,
      );
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
      await engine.createGrant(
        ctx.workspaceId,
        ctx.principalId,
        collectionId,
        'admin',
        null,
        null,
        { actorId: ctx.principalId },
      );
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
