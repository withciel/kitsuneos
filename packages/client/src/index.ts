export interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
}

export class KitsuneClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (!response.ok || body.errors?.length) {
      throw new Error(
        body.errors?.[0]?.message ?? `GraphQL HTTP ${response.status}`,
      );
    }
    if (body.data === undefined) {
      throw new Error('GraphQL response missing data');
    }
    return body.data;
  }

  async readRecord<C extends string>(
    collection: C,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/records/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`REST GET ${response.status}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }
}

export async function graphql<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return defaultClient().graphql<T>(query, variables);
}

export async function readRecord<C extends string>(
  collection: C,
  id: string,
): Promise<Record<string, unknown> | null> {
  return defaultClient().readRecord(collection, id);
}

function defaultClient(): KitsuneClient {
  const baseUrl = process.env.KITSUNE_URL;
  const apiKey = process.env.KITSUNE_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('KITSUNE_URL and KITSUNE_API_KEY are required');
  }
  return new KitsuneClient({ baseUrl, apiKey });
}

export * from './generated.js';
