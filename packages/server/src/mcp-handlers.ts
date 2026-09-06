import type { KitsuneEngine } from '@kitsuneos/core';
import {
  assertPlanLimit,
  KitsuneError,
  recordUsageEvent,
} from '@kitsuneos/core';
import { invokeMcpTool, isKitsuneError } from '@kitsuneos/mcp/invoke';
import { TOOL_DEFINITIONS } from '@kitsuneos/mcp/schemas';
import { checkRateLimit } from './rate-limit.js';
import {
  auditAuthFailure,
  type CredentialContext,
  resolveCredential,
} from './resolve-credential.js';

export interface McpHttpResult {
  status: number;
  body: Record<string, unknown>;
}

function workspaceInjection(
  args: Record<string, unknown> | undefined,
): boolean {
  return (
    'workspaceId' in (args ?? {}) ||
    'workspace_id' in (args ?? {}) ||
    'workspace' in (args ?? {})
  );
}

function parseToolCallBody(
  rawBody: string,
): McpHttpResult | { tool: string; arguments: Record<string, unknown> } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody || '{}');
  } catch {
    return {
      status: 400,
      body: { error: 'validation', message: 'invalid JSON' },
    };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return {
      status: 400,
      body: { error: 'validation', message: 'body must be an object' },
    };
  }
  const payload = parsed as { tool?: unknown; arguments?: unknown };
  if (typeof payload.tool !== 'string' || !payload.tool) {
    return {
      status: 400,
      body: { error: 'validation', message: 'tool is required' },
    };
  }
  if (
    payload.arguments !== undefined &&
    (typeof payload.arguments !== 'object' || payload.arguments === null)
  ) {
    return {
      status: 400,
      body: { error: 'validation', message: 'arguments must be an object' },
    };
  }
  return {
    tool: payload.tool,
    arguments: (payload.arguments as Record<string, unknown> | undefined) ?? {},
  };
}

/** Shared MCP HTTP handler for Node http.Server and Next.js route handlers. */
export async function handleMcpHttpRequest(
  engine: KitsuneEngine,
  method: string,
  pathname: string,
  authorization: string | null | undefined,
  rawBody: string,
): Promise<McpHttpResult> {
  const authHeader = authorization ?? undefined;

  if (method === 'GET' && pathname === '/health') {
    return { status: 200, body: { ok: true } };
  }

  if (method === 'GET' && pathname === '/mcp/tools') {
    try {
      const credential = await resolveCredential(engine, authHeader);
      if (!checkRateLimit(credential.keyId)) {
        return {
          status: 429,
          body: { error: 'rate_limited', message: 'Too many requests' },
        };
      }
    } catch (error) {
      await auditAuthFailure(
        engine,
        authHeader,
        error instanceof KitsuneError ? error.message : 'auth failed',
      );
      return {
        status: 401,
        body: { error: 'forbidden', message: 'Invalid API key' },
      };
    }
    return { status: 200, body: { tools: TOOL_DEFINITIONS } };
  }

  if (method === 'POST' && pathname === '/mcp/tools/call') {
    let credential: CredentialContext;
    try {
      credential = await resolveCredential(engine, authHeader);
    } catch (error) {
      await auditAuthFailure(
        engine,
        authHeader,
        error instanceof KitsuneError ? error.message : 'auth failed',
      );
      return {
        status: 401,
        body: { error: 'forbidden', message: 'Invalid API key' },
      };
    }

    if (!checkRateLimit(credential.keyId)) {
      return {
        status: 429,
        body: { error: 'rate_limited', message: 'Too many requests' },
      };
    }

    const parsed = parseToolCallBody(rawBody);
    if ('status' in parsed) {
      return parsed;
    }

    if (workspaceInjection(parsed.arguments)) {
      return {
        status: 400,
        body: {
          error: 'validation',
          message: 'workspace parameters are not permitted',
        },
      };
    }

    try {
      await assertPlanLimit(engine.ownerPool, {
        workspaceId: credential.workspaceId,
        dimension: 'mcpOpsPerDay',
      });
      const result = await invokeMcpTool(
        engine,
        {
          workspaceId: credential.workspaceId,
          principalId: credential.principalId,
        },
        parsed.tool,
        parsed.arguments,
      );
      void recordUsageEvent(
        engine.ownerPool,
        credential.workspaceId,
        parsed.tool,
      ).catch(() => {});
      return { status: 200, body: { result } };
    } catch (error) {
      if (isKitsuneError(error)) {
        const status = error.code === 'forbidden' ? 403 : 400;
        return {
          status,
          body: { error: error.code, message: error.message, ...error.details },
        };
      }
      throw error;
    }
  }

  return { status: 404, body: { error: 'not_found' } };
}
