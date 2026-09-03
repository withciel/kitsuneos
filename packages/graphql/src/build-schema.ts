import type {
  JsonValue,
  KitsuneEngine,
  QueryAggregate,
  QueryFilter,
  QueryJoin,
  QuerySort,
} from '@kitsuneos/core';
import {
  GraphQLBoolean,
  GraphQLEnumType,
  type GraphQLFieldConfig,
  GraphQLFloat,
  GraphQLID,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  type GraphQLOutputType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';
import { GraphQLJSON } from './json-scalar.js';
import {
  createLoaders,
  type GraphqlAuthContext,
  type RelationLoaders,
} from './loaders.js';
import { relationObjectFieldName, typeNameForCollection } from './names.js';

export interface GraphqlEngineContext extends GraphqlAuthContext {
  engine: KitsuneEngine;
  loaders: RelationLoaders;
}

interface VisibleField {
  name: string;
  type: string;
  relationTarget: string | null;
}

interface VisibleCollection {
  name: string;
  fields: VisibleField[];
}

interface ConnectionArgs {
  first?: number | null;
  after?: string | null;
  filters?: QueryFilter[] | null;
  sort?: QuerySort[] | null;
}

interface ConnectionPage {
  nodes: Record<string, JsonValue>[];
  hasNextPage: boolean;
  endCursor: string | null;
}

const FilterOp = new GraphQLEnumType({
  name: 'FilterOp',
  values: {
    eq: { value: 'eq' },
    neq: { value: 'neq' },
    lt: { value: 'lt' },
    lte: { value: 'lte' },
    gt: { value: 'gt' },
    gte: { value: 'gte' },
    in: { value: 'in' },
  },
});

const SortDirection = new GraphQLEnumType({
  name: 'SortDirection',
  values: {
    asc: { value: 'asc' },
    desc: { value: 'desc' },
  },
});

const FilterInput = new GraphQLInputObjectType({
  name: 'QueryFilterInput',
  fields: {
    field: { type: new GraphQLNonNull(GraphQLString) },
    op: { type: new GraphQLNonNull(FilterOp) },
    value: { type: GraphQLJSON },
  },
});

const SortInput = new GraphQLInputObjectType({
  name: 'QuerySortInput',
  fields: {
    field: { type: new GraphQLNonNull(GraphQLString) },
    direction: { type: new GraphQLNonNull(SortDirection) },
  },
});

const JoinInput = new GraphQLInputObjectType({
  name: 'QueryJoinInput',
  fields: {
    field: { type: new GraphQLNonNull(GraphQLString) },
    as: { type: new GraphQLNonNull(GraphQLString) },
  },
});

const AggregateFn = new GraphQLEnumType({
  name: 'AggregateFn',
  values: {
    count: { value: 'count' },
    sum: { value: 'sum' },
    avg: { value: 'avg' },
    min: { value: 'min' },
    max: { value: 'max' },
  },
});

const AggregateInput = new GraphQLInputObjectType({
  name: 'QueryAggregateInput',
  fields: {
    fn: { type: new GraphQLNonNull(AggregateFn) },
    field: { type: GraphQLString },
    alias: { type: new GraphQLNonNull(GraphQLString) },
  },
});

const PageInfo = new GraphQLObjectType({
  name: 'PageInfo',
  fields: {
    hasNextPage: { type: new GraphQLNonNull(GraphQLBoolean) },
    endCursor: { type: GraphQLString },
  },
});

function scalarForField(type: string): GraphQLOutputType {
  switch (type) {
    case 'number':
      return GraphQLFloat;
    case 'boolean':
      return GraphQLBoolean;
    case 'relation':
      return GraphQLID;
    default:
      return GraphQLString;
  }
}

function coerceFieldValue(type: string, value: JsonValue): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (type === 'number') {
    return Number(value);
  }
  if (type === 'boolean') {
    return Boolean(value);
  }
  return value;
}

function decodeCursor(after: string | null | undefined): string | null {
  if (!after) {
    return null;
  }
  return after;
}

async function loadConnection(
  ctx: GraphqlEngineContext,
  collection: string,
  args: ConnectionArgs,
  extraFilters: QueryFilter[] = [],
): Promise<ConnectionPage> {
  const first = Math.min(Math.max(args.first ?? 20, 1), 100);
  const filters: QueryFilter[] = [...extraFilters, ...(args.filters ?? [])];
  const afterId = decodeCursor(args.after);
  if (afterId) {
    filters.push({ field: 'id', op: 'gt', value: afterId });
  }
  const sort: QuerySort[] = [
    ...(args.sort ?? []),
    { field: 'id', direction: 'asc' },
  ];
  const rows = await ctx.engine.query(ctx.workspaceId, ctx.principalId, {
    collection,
    filters,
    sort,
    limit: first + 1,
  });
  const hasNextPage = rows.length > first;
  const nodes = hasNextPage ? rows.slice(0, first) : rows;
  const last = nodes[nodes.length - 1];
  return {
    nodes,
    hasNextPage,
    endCursor: last ? String(last.id) : null,
  };
}

export async function buildWorkspaceSchema(
  engine: KitsuneEngine,
  ctx: GraphqlAuthContext,
): Promise<GraphQLSchema> {
  const described = await engine.describeSchema(
    ctx.workspaceId,
    ctx.principalId,
  );
  const collections: VisibleCollection[] = described.collections.map(
    (collection) => ({
      name: collection.name,
      fields: collection.fields.map((field) => ({
        name: field.name,
        type: field.type,
        relationTarget: field.relationTarget ?? null,
      })),
    }),
  );
  const visibleNames = new Set(collections.map((c) => c.name));
  const types = new Map<string, GraphQLObjectType>();
  const connections = new Map<string, GraphQLObjectType>();
  const edges = new Map<string, GraphQLObjectType>();

  const inverse: Array<{
    parent: string;
    child: string;
    fk: string;
  }> = [];
  for (const collection of collections) {
    for (const field of collection.fields) {
      if (field.type === 'relation' && field.relationTarget) {
        if (visibleNames.has(field.relationTarget)) {
          inverse.push({
            parent: field.relationTarget,
            child: collection.name,
            fk: field.name,
          });
        }
      }
    }
  }

  for (const collection of collections) {
    const typeName = typeNameForCollection(collection.name);
    const objectType = new GraphQLObjectType({
      name: typeName,
      fields: () => {
        const fields: Record<
          string,
          GraphQLFieldConfig<Record<string, JsonValue>, GraphqlEngineContext>
        > = {
          id: {
            type: new GraphQLNonNull(GraphQLID),
            resolve: (row) => String(row.id),
          },
        };
        for (const field of collection.fields) {
          fields[field.name] = {
            type: scalarForField(field.type),
            resolve: (row) =>
              coerceFieldValue(field.type, row[field.name] ?? null),
          };
          if (
            field.type === 'relation' &&
            field.relationTarget &&
            visibleNames.has(field.relationTarget)
          ) {
            const nestedName = relationObjectFieldName(field.name);
            const targetType = types.get(field.relationTarget);
            if (targetType && nestedName !== field.name) {
              const targetCollection = field.relationTarget;
              fields[nestedName] = {
                type: targetType,
                resolve: async (row, _args, context) => {
                  const id = row[field.name];
                  if (typeof id !== 'string' || !id) {
                    return null;
                  }
                  return context.loaders
                    .forCollection(targetCollection)
                    .load(id);
                },
              };
            }
          }
        }
        for (const rel of inverse.filter((r) => r.parent === collection.name)) {
          const childType = types.get(rel.child);
          const childConnection = connections.get(rel.child);
          if (!childType || !childConnection) {
            continue;
          }
          if (fields[rel.child]) {
            continue;
          }
          fields[rel.child] = {
            type: new GraphQLNonNull(childConnection),
            args: connectionArgs(),
            resolve: async (row, args, context) => {
              const page = await loadConnection(context, rel.child, args, [
                { field: rel.fk, op: 'eq', value: String(row.id) },
              ]);
              return page;
            },
          };
        }
        return fields;
      },
    });
    types.set(collection.name, objectType);

    const edgeType = new GraphQLObjectType({
      name: `${typeName}Edge`,
      fields: {
        cursor: { type: new GraphQLNonNull(GraphQLString) },
        node: { type: new GraphQLNonNull(objectType) },
      },
    });
    edges.set(collection.name, edgeType);

    const connectionType = new GraphQLObjectType<
      ConnectionPage,
      GraphqlEngineContext
    >({
      name: `${typeName}Connection`,
      fields: {
        edges: {
          type: new GraphQLNonNull(
            new GraphQLList(new GraphQLNonNull(edgeType)),
          ),
          resolve: (page) =>
            page.nodes.map((node) => ({
              cursor: String(node.id),
              node,
            })),
        },
        nodes: {
          type: new GraphQLNonNull(
            new GraphQLList(new GraphQLNonNull(objectType)),
          ),
          resolve: (page) => page.nodes,
        },
        pageInfo: {
          type: new GraphQLNonNull(PageInfo),
          resolve: (page) => ({
            hasNextPage: page.hasNextPage,
            endCursor: page.endCursor,
          }),
        },
      },
    });
    connections.set(collection.name, connectionType);
  }

  const queryFields: Record<
    string,
    GraphQLFieldConfig<unknown, GraphqlEngineContext>
  > = {};

  for (const collection of collections) {
    const objectType = types.get(collection.name);
    const connectionType = connections.get(collection.name);
    if (!objectType || !connectionType) {
      continue;
    }
    const singular = singularizeSafe(collection.name);

    queryFields[collection.name] = {
      type: new GraphQLNonNull(connectionType),
      args: connectionArgs(),
      resolve: async (_src, args, context) =>
        loadConnection(context, collection.name, args),
    };

    queryFields[singular] = {
      type: objectType,
      args: {
        id: { type: new GraphQLNonNull(GraphQLID) },
      },
      resolve: async (_src, args: { id: string }, context) => {
        return context.engine.readRecord(
          context.workspaceId,
          context.principalId,
          collection.name,
          args.id,
        );
      },
    };

    queryFields[`${collection.name}Aggregate`] = {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(GraphQLJSON)),
      ),
      args: {
        groupBy: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) },
        join: { type: JoinInput },
        aggregates: {
          type: new GraphQLNonNull(
            new GraphQLList(new GraphQLNonNull(AggregateInput)),
          ),
        },
        filters: {
          type: new GraphQLList(new GraphQLNonNull(FilterInput)),
        },
      },
      resolve: async (
        _src,
        args: {
          groupBy?: string[] | null;
          join?: QueryJoin | null;
          aggregates: QueryAggregate[];
          filters?: QueryFilter[] | null;
        },
        context,
      ) => {
        return context.engine.query(context.workspaceId, context.principalId, {
          collection: collection.name,
          groupBy: args.groupBy ?? undefined,
          join: args.join ?? undefined,
          aggregates: args.aggregates,
          filters: args.filters ?? undefined,
        });
      },
    };
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: () => queryFields,
    }),
  });
}

function connectionArgs() {
  return {
    first: { type: GraphQLInt },
    after: { type: GraphQLString },
    filters: { type: new GraphQLList(new GraphQLNonNull(FilterInput)) },
    sort: { type: new GraphQLList(new GraphQLNonNull(SortInput)) },
  };
}

function singularizeSafe(collection: string): string {
  const typeName = typeNameForCollection(collection);
  return typeName.charAt(0).toLowerCase() + typeName.slice(1);
}

export function attachLoaders(
  engine: KitsuneEngine,
  ctx: GraphqlAuthContext,
): GraphqlEngineContext {
  return {
    ...ctx,
    engine,
    loaders: createLoaders(engine, ctx),
  };
}
