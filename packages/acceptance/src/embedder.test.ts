import {
  createDefaultEmbedder,
  DeterministicEmbedder,
  EMBEDDING_DIMENSIONS,
  OpenAIEmbedder,
} from '@kitsuneos/core';
import { afterEach, describe, expect, it } from 'vitest';

describe('OpenAIEmbedder + createDefaultEmbedder', () => {
  const prevProvider = process.env.KITSUNE_EMBEDDING_PROVIDER;
  const prevKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (prevProvider === undefined) {
      delete process.env.KITSUNE_EMBEDDING_PROVIDER;
    } else {
      process.env.KITSUNE_EMBEDDING_PROVIDER = prevProvider;
    }
    if (prevKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = prevKey;
    }
  });

  it('createDefaultEmbedder returns DeterministicEmbedder by default', () => {
    delete process.env.KITSUNE_EMBEDDING_PROVIDER;
    const embedder = createDefaultEmbedder();
    expect(embedder).toBeInstanceOf(DeterministicEmbedder);
  });

  it('createDefaultEmbedder returns OpenAIEmbedder when provider=openai', () => {
    process.env.KITSUNE_EMBEDDING_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    const embedder = createDefaultEmbedder();
    expect(embedder).toBeInstanceOf(OpenAIEmbedder);
  });

  it('OpenAIEmbedder posts to embeddings API and returns 1536-d vectors', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeEmbedding = Array.from(
      { length: EMBEDDING_DIMENSIONS },
      (_, i) => (i === 0 ? 1 : 0),
    );
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          data: [{ embedding: fakeEmbedding, index: 0 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const embedder = new OpenAIEmbedder({
      apiKey: 'sk-test',
      fetchImpl,
      baseUrl: 'https://example.test/v1',
    });
    const vectors = await embedder.embed(['hello prose']);
    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://example.test/v1/embeddings');
    const body = JSON.parse(String(calls[0]?.init?.body)) as {
      model: string;
      input: string[];
      dimensions: number;
    };
    expect(body.model).toBe('text-embedding-3-small');
    expect(body.input).toEqual(['hello prose']);
    expect(body.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it('OpenAIEmbedder sorts by index when API returns out of order', async () => {
    const a = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);
    const b = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.2);
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            { embedding: b, index: 1 },
            { embedding: a, index: 0 },
          ],
        }),
        { status: 200 },
      );

    const embedder = new OpenAIEmbedder({ apiKey: 'sk-test', fetchImpl });
    const vectors = await embedder.embed(['first', 'second']);
    expect(vectors[0]?.[0]).toBe(0.1);
    expect(vectors[1]?.[0]).toBe(0.2);
  });

  it('OpenAIEmbedder surfaces API errors', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: { message: 'quota' } }), {
        status: 429,
      });
    const embedder = new OpenAIEmbedder({ apiKey: 'sk-test', fetchImpl });
    await expect(embedder.embed(['x'])).rejects.toThrow(/quota/);
  });
});
