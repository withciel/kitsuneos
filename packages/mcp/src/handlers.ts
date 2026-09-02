import type { KitsuneEngine } from '@kitsuneos/core';
import type {
  JsonValue,
  ProposeChangeSetInput,
  QueryRequest,
  ReviewDecision,
} from '@kitsuneos/core';

export interface McpContext {
  workspaceId: string;
  principalId: string;
}

export function createMcpHandlers(engine: KitsuneEngine, getContext: () => McpContext) {
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
