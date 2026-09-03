import type { KitsuneEngine } from '@kitsuneos/core';
import { type ExecutionResult, graphql } from 'graphql';
import { attachLoaders, buildWorkspaceSchema } from './build-schema.js';
import type { GraphqlAuthContext } from './loaders.js';

export async function executeGraphql(
  engine: KitsuneEngine,
  ctx: GraphqlAuthContext,
  source: string,
  variableValues?: Record<string, unknown>,
): Promise<ExecutionResult> {
  const schema = await buildWorkspaceSchema(engine, ctx);
  return graphql({
    schema,
    source,
    variableValues,
    contextValue: attachLoaders(engine, ctx),
  });
}
