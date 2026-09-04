const PREDICATE_OPS = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in'] as const;

const filterSchema = {
  type: 'object',
  required: ['field', 'op'],
  properties: {
    field: {
      type: 'string',
      description: 'Field name. Must be readable by the caller.',
    },
    op: { type: 'string', enum: [...PREDICATE_OPS] },
    value: {
      description: 'Comparison value. An array when op is "in".',
    },
  },
} as const;

const querySchema = {
  type: 'object',
  required: ['collection'],
  properties: {
    collection: {
      type: 'string',
      description: 'Collection name from describe_schema.',
    },
    fields: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Fields to return. Omit for every field you are allowed to read. Requesting a field outside your grant is an error naming the field. The record id is always returned.',
    },
    filters: { type: 'array', items: filterSchema },
    sort: {
      type: 'array',
      items: {
        type: 'object',
        required: ['field', 'direction'],
        properties: {
          field: { type: 'string' },
          direction: { type: 'string', enum: ['asc', 'desc'] },
        },
      },
    },
    aggregates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fn', 'alias'],
        properties: {
          fn: { type: 'string', enum: ['count', 'sum', 'avg', 'min', 'max'] },
          field: { type: 'string', description: 'Omit for count(*).' },
          alias: { type: 'string' },
        },
      },
    },
    groupBy: { type: 'array', items: { type: 'string' } },
    join: {
      type: 'object',
      required: ['field', 'as'],
      properties: {
        field: {
          type: 'string',
          description: 'Many-to-one relation field on the root collection.',
        },
        as: {
          type: 'string',
          description:
            'SQL alias used to qualify joined fields, e.g. account.name.',
        },
      },
    },
    limit: { type: 'integer', minimum: 0 },
    offset: { type: 'integer', minimum: 0 },
  },
} as const;

const readRecordSchema = {
  type: 'object',
  required: ['collection', 'recordId'],
  properties: {
    collection: { type: 'string' },
    recordId: { type: 'string', description: 'Record uuid.' },
    fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Omit for every field you are allowed to read.',
    },
  },
} as const;

const proposeChangeSetSchema = {
  type: 'object',
  required: ['operations'],
  properties: {
    title: {
      type: 'string',
      description: 'Short summary shown to the reviewer.',
    },
    rationale: {
      type: 'string',
      description:
        'Why you are proposing this. Reviewers read it, so cite your source.',
    },
    operations: {
      type: 'array',
      minItems: 1,
      description:
        'One operation per field. To create a record, emit one insert operation per field, all sharing a recordId you generate.',
      items: {
        type: 'object',
        required: ['collection', 'op'],
        properties: {
          collection: { type: 'string' },
          recordId: {
            type: 'string',
            description:
              'Existing record uuid for update and delete. For insert, a uuid you generate so several field operations join into one record.',
          },
          op: { type: 'string', enum: ['insert', 'update', 'delete'] },
          fieldName: {
            type: 'string',
            description:
              'Required for insert and update. Omit for delete, which is whole-record.',
          },
          newValue: { description: 'The proposed value. Omit for delete.' },
        },
      },
    },
  },
} as const;

const readChangeSetFeedbackSchema = {
  type: 'object',
  required: ['changeSetId'],
  properties: {
    changeSetId: {
      type: 'string',
      description: 'Change set uuid from propose_change_set.',
    },
  },
} as const;

const reviewChangeSetSchema = {
  type: 'object',
  required: ['changeSetId', 'decisions'],
  properties: {
    changeSetId: { type: 'string' },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['opId', 'status'],
        properties: {
          opId: { type: 'string' },
          status: { type: 'string', enum: ['approved', 'rejected'] },
          comment: { type: 'string' },
        },
      },
    },
  },
} as const;

const applyChangeSetSchema = {
  type: 'object',
  required: ['changeSetId'],
  properties: {
    changeSetId: { type: 'string' },
  },
} as const;

const defineCollectionSchema = {
  type: 'object',
  required: ['name', 'fields'],
  properties: {
    name: { type: 'string' },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: { type: 'string' },
          type: {
            type: 'string',
            enum: [
              'text',
              'number',
              'boolean',
              'timestamp',
              'enum',
              'relation',
              'prose',
            ],
          },
          nullable: { type: 'boolean' },
          relationTarget: { type: 'string' },
          enumValues: { type: 'array', items: { type: 'string' } },
          indexed: { type: 'boolean' },
        },
      },
    },
  },
} as const;

const searchSchema = {
  type: 'object',
  required: ['query'],
  properties: {
    query: {
      type: 'string',
      description: 'Natural-language search over prose fields you can read.',
    },
    collections: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Limit search to these collections. Omit to search every collection your grant allows.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      description: 'Max hits to return (default 10).',
    },
  },
} as const;

const readRelatedSchema = {
  type: 'object',
  required: ['collection', 'recordId'],
  properties: {
    collection: { type: 'string' },
    recordId: { type: 'string', description: 'Record uuid.' },
  },
} as const;

export const TOOL_DEFINITIONS = [
  {
    name: 'describe_schema',
    description:
      'List the collections and fields you are allowed to see, with your capability on each. Fields outside your grant are not listed at all. Call this first.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'query',
    description:
      'Read records from a collection. Results are restricted to the rows and fields your grant allows; the record id is always included so you can propose changes against a result.',
    inputSchema: querySchema,
  },
  {
    name: 'read_record',
    description:
      'Read one record by id. Returns null when the record does not exist or your grant excludes it, which are deliberately indistinguishable.',
    inputSchema: readRecordSchema,
  },
  {
    name: 'search',
    description:
      'Semantic search over prose fields. Grants (field masks and row predicates) are applied inside the query — masked fields never appear in excerpts, and denied collections are omitted entirely.',
    inputSchema: searchSchema,
  },
  {
    name: 'read_related',
    description:
      'List outgoing and incoming relation neighbors of a record that you are allowed to see. Invisible targets are omitted.',
    inputSchema: readRelatedSchema,
  },
  {
    name: 'propose_change_set',
    description:
      'Propose a change instead of writing it. Every operation names a single field. The change set enters a review queue and lands only after a human approves it. Proposing a field outside your grant fails immediately with an error naming the field.',
    inputSchema: proposeChangeSetSchema,
  },
  {
    name: 'read_change_set_feedback',
    description:
      'Check the status of a change set you authored, including per-operation approvals, rejections and reviewer comments.',
    inputSchema: readChangeSetFeedbackSchema,
  },
  {
    name: 'review_change_set',
    description:
      'Approve or reject individual operations in a change set awaiting review.',
    inputSchema: reviewChangeSetSchema,
  },
  {
    name: 'apply_change_set',
    description: 'Apply a fully reviewed change set to the database.',
    inputSchema: applyChangeSetSchema,
  },
  {
    name: 'define_collection',
    description:
      'Define a new collection in your workspace. Requires admin capability. Identifiers must match ^[a-z_][a-z0-9_]*$.',
    inputSchema: defineCollectionSchema,
  },
] as const;
