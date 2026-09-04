import { KitsuneError } from '../types.js';
import {
  DeterministicEmbedder,
  EMBEDDING_DIMENSIONS,
  type Embedder,
} from './embedder.js';

export interface OpenAIEmbedderOptions {
  apiKey?: string;
  /** Defaults to text-embedding-3-small (1536-d, matches pgvector schema). */
  model?: string;
  baseUrl?: string;
  /** Inject for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
}

/**
 * OpenAI embeddings for production semantic search.
 * Use when KITSUNE_EMBEDDING_PROVIDER=openai and OPENAI_API_KEY is set.
 * Model must emit 1536-d vectors (text-embedding-3-small default).
 */
export class OpenAIEmbedder implements Embedder {
  readonly dimensions = EMBEDDING_DIMENSIONS;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAIEmbedderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    if (!apiKey) {
      throw new KitsuneError(
        'OPENAI_API_KEY is required for OpenAIEmbedder',
        'validation',
      );
    }
    this.apiKey = apiKey;
    this.model =
      options.model ??
      process.env.KITSUNE_EMBEDDING_MODEL ??
      'text-embedding-3-small';
    this.baseUrl =
      options.baseUrl ??
      process.env.KITSUNE_EMBEDDING_BASE_URL ??
      'https://api.openai.com/v1';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    const body = (await response.json()) as OpenAIEmbeddingResponse;
    if (!response.ok) {
      throw new KitsuneError(
        body.error?.message ?? `OpenAI embeddings failed (${response.status})`,
        'internal',
      );
    }

    const rows = body.data;
    if (!rows || rows.length !== texts.length) {
      throw new KitsuneError(
        'OpenAI embeddings response size mismatch',
        'internal',
      );
    }

    // OpenAI may return data out of order — sort by index.
    const sorted = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return sorted.map((row) => {
      const embedding = row.embedding;
      if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new KitsuneError(
          `Expected ${EMBEDDING_DIMENSIONS}-d embedding, got ${embedding?.length ?? 0}`,
          'internal',
        );
      }
      return embedding;
    });
  }
}

/**
 * Prefer OpenAI when explicitly configured; otherwise DeterministicEmbedder
 * so CI and local never require API keys.
 */
export function createDefaultEmbedder(): Embedder {
  const provider = (
    process.env.KITSUNE_EMBEDDING_PROVIDER ?? 'deterministic'
  ).toLowerCase();
  if (provider === 'openai') {
    return new OpenAIEmbedder();
  }
  if (provider === 'deterministic' || provider === '') {
    return new DeterministicEmbedder();
  }
  throw new KitsuneError(
    `Unknown KITSUNE_EMBEDDING_PROVIDER: ${provider}`,
    'validation',
  );
}
