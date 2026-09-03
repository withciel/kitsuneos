import type { KitsuneEngine } from '@kitsuneos/core';
import { KitsuneError } from '@kitsuneos/core';
import { createYoga } from 'graphql-yoga';
import { attachLoaders, buildWorkspaceSchema } from './build-schema.js';
import type { GraphqlAuthContext } from './loaders.js';

export interface HttpJsonResult {
  status: number;
  body: Record<string, unknown>;
}

function workspaceInjected(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (
    'workspaceId' in record ||
    'workspace_id' in record ||
    'workspace' in record
  ) {
    return true;
  }
  if ('variables' in record) {
    return workspaceInjected(record.variables);
  }
  return false;
}

export async function handleGraphqlHttp(
  engine: KitsuneEngine,
  ctx: GraphqlAuthContext,
  rawBody: string,
  requestUrl = 'http://localhost/api/graphql',
): Promise<HttpJsonResult> {
  let payload: unknown = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return {
      status: 400,
      body: { error: 'validation', message: 'invalid JSON' },
    };
  }
  if (workspaceInjected(payload)) {
    return {
      status: 400,
      body: {
        error: 'validation',
        message: 'workspace parameters are not permitted',
      },
    };
  }
  const schema = await buildWorkspaceSchema(engine, ctx);
  const yoga = createYoga({
    schema,
    graphqlEndpoint: new URL(requestUrl).pathname,
    graphiql: false,
    maskedErrors: false,
    context: () => attachLoaders(engine, ctx),
  });
  const request = new Request(requestUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody || '{}',
  });
  const response = await yoga.fetch(request);
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

export async function handleRestRecordGet(
  engine: KitsuneEngine,
  ctx: GraphqlAuthContext,
  collection: string,
  id: string,
): Promise<HttpJsonResult> {
  const row = await engine.readRecord(
    ctx.workspaceId,
    ctx.principalId,
    collection,
    id,
  );
  if (!row) {
    return { status: 404, body: { error: 'Not found' } };
  }
  return { status: 200, body: row };
}

export function httpAuthError(error: unknown): HttpJsonResult {
  const message =
    error instanceof KitsuneError ? error.message : 'Invalid API key';
  return {
    status: 401,
    body: { error: 'forbidden', message },
  };
}
