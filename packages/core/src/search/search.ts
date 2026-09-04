import type { PoolClient } from 'pg';
import { compilePredicate } from '../compiler/predicate-sql.js';
import { getCollectionMeta } from '../compiler/query.js';
import { queryRows } from '../db/pool.js';
import { assertFieldAllowed, loadResolvedGrant } from '../grants/resolve.js';
import type { ResolvedGrant } from '../types.js';
import { CAPABILITY_ORDER, KitsuneError, quoteIdent } from '../types.js';
import {
  EMBEDDING_DIMENSIONS,
  type Embedder,
  vectorLiteral,
} from './embedder.js';

export interface SearchRequest {
  query: string;
  collections?: string[];
  limit?: number;
}

export interface SearchHit {
  collection: string;
  recordId: string;
  fieldName: string;
  score: number;
  excerpt: string;
  stale: boolean;
}

export interface SearchResult {
  hits: SearchHit[];
}

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;
const EXCERPT_MAX = 240;
const EXACT_SCAN_CANDIDATE_CEILING = 10_000;

function embTableName(tableName: string): string {
  return `${tableName}__emb`;
}

function canRead(grant: ResolvedGrant | null): grant is ResolvedGrant {
  return (
    !!grant &&
    CAPABILITY_ORDER.indexOf(grant.capability) >=
      CAPABILITY_ORDER.indexOf('read')
  );
}

function readableProseFields(
  fieldMeta: Array<{ name: string; type: string }>,
  grant: ResolvedGrant,
): string[] {
  return fieldMeta
    .filter((f) => f.type === 'prose')
    .filter((f) => {
      try {
        assertFieldAllowed(grant, f.name, 'read');
        return true;
      } catch {
        return false;
      }
    })
    .map((f) => f.name);
}

function truncateExcerpt(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= EXCERPT_MAX) return trimmed;
  return `${trimmed.slice(0, EXCERPT_MAX - 1)}…`;
}

export async function searchCollections(
  client: PoolClient,
  workspaceId: string,
  principalId: string,
  schemaName: string,
  embedder: Embedder,
  request: SearchRequest,
): Promise<SearchResult> {
  const query = request.query?.trim() ?? '';
  if (!query) {
    throw new KitsuneError('query is required', 'validation');
  }
  const limit = Math.min(
    Math.max(1, request.limit ?? DEFAULT_LIMIT),
    MAX_LIMIT,
  );

  const collections = await queryRows<{ id: string; name: string }>(
    client,
    `SELECT id, name FROM kitsune.collections WHERE workspace_id = $1 ORDER BY name`,
    [workspaceId],
  );

  const wanted = request.collections ? new Set(request.collections) : null;

  const [queryVector] = await embedder.embed([query]);
  if (!queryVector) {
    throw new KitsuneError('Failed to embed query', 'internal');
  }
  const vectorSql = vectorLiteral(queryVector);

  const hits: SearchHit[] = [];

  for (const collection of collections) {
    if (wanted && !wanted.has(collection.name)) continue;

    const grant = await loadResolvedGrant(client, principalId, collection.id);
    if (!canRead(grant)) continue;

    const meta = await getCollectionMeta(client, workspaceId, collection.name);
    const proseFields = readableProseFields(meta.fieldMeta, grant);
    if (proseFields.length === 0) continue;

    const qSchema = quoteIdent(schemaName);
    const qBase = quoteIdent(meta.tableName);
    const qEmb = quoteIdent(embTableName(meta.tableName));

    const params: unknown[] = [vectorSql, proseFields];
    let paramIdx = 3;
    const whereParts = [
      'b._deleted_at IS NULL',
      `e.field_name = ANY($2::text[])`,
    ];

    if (grant.rowPredicate) {
      const compiled = compilePredicate(grant.rowPredicate, 'b', paramIdx);
      whereParts.push(compiled.sql);
      params.push(...compiled.params);
      paramIdx += compiled.params.length;
    }

    // Candidate estimate for filtered ANN strategy (ADR-004).
    const countRow = await queryRows<{ n: string }>(
      client,
      `SELECT COUNT(*)::text AS n FROM ${qSchema}.${qBase} b WHERE b._deleted_at IS NULL`,
      [],
    );
    const candidateCount = Number(countRow[0]?.n ?? 0);
    const useExact = candidateCount <= EXACT_SCAN_CANDIDATE_CEILING;

    const distanceExpr = `e.embedding <=> $1::vector`;
    const orderLimit = useExact
      ? `ORDER BY ${distanceExpr} ASC LIMIT ${limit}`
      : `ORDER BY ${distanceExpr} ASC LIMIT ${limit * 5}`;

    const sql = `
      SELECT
        e.record_id::text AS record_id,
        e.field_name,
        e.content,
        (1 - (${distanceExpr}))::float8 AS score,
        (b._updated_at > e.indexed_at) AS stale
      FROM ${qSchema}.${qEmb} e
      INNER JOIN ${qSchema}.${qBase} b ON b.id = e.record_id
      WHERE ${whereParts.join(' AND ')}
      ${orderLimit}
    `;

    const rows = await queryRows<{
      record_id: string;
      field_name: string;
      content: string;
      score: number;
      stale: boolean;
    }>(client, sql, params);

    for (const row of rows.slice(0, limit)) {
      hits.push({
        collection: collection.name,
        recordId: row.record_id,
        fieldName: row.field_name,
        score: Number(row.score),
        excerpt: truncateExcerpt(row.content),
        stale: Boolean(row.stale),
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return { hits: hits.slice(0, limit) };
}

export async function upsertRecordEmbeddings(
  client: PoolClient,
  schemaName: string,
  tableName: string,
  recordId: string,
  fields: Array<{ name: string; content: string }>,
  embedder: Embedder,
): Promise<void> {
  const qSchema = quoteIdent(schemaName);
  const qEmb = quoteIdent(embTableName(tableName));

  await client.query(`DELETE FROM ${qSchema}.${qEmb} WHERE record_id = $1`, [
    recordId,
  ]);

  if (fields.length === 0) return;

  const vectors = await embedder.embed(fields.map((f) => f.content));
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    const vector = vectors[i]!;
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new KitsuneError('Unexpected embedding dimensions', 'internal');
    }
    await client.query(
      `INSERT INTO ${qSchema}.${qEmb}
        (record_id, field_name, chunk_idx, content, embedding, indexed_at)
       VALUES ($1, $2, 0, $3, $4::vector, now())`,
      [recordId, field.name, field.content, vectorLiteral(vector)],
    );
  }
}

export { embTableName };
