import { createHash } from 'node:crypto';

export const EMBEDDING_DIMENSIONS = 1536;

export interface Embedder {
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/** Stable hash → unit vector. Same text always yields the same vector (CI / local). */
export class DeterministicEmbedder implements Embedder {
  readonly dimensions = EMBEDDING_DIMENSIONS;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => hashToUnitVector(text, this.dimensions));
  }
}

function hashToUnitVector(text: string, dimensions: number): number[] {
  const out = new Array<number>(dimensions).fill(0);
  const normalized = text.normalize('NFKC').trim().toLowerCase();
  if (!normalized) {
    out[0] = 1;
    return out;
  }
  let seed = normalized;
  for (let i = 0; i < dimensions; i += 32) {
    const digest = createHash('sha256').update(`${seed}:${i}`).digest();
    seed = digest.toString('hex');
    for (let j = 0; j < 32 && i + j < dimensions; j++) {
      // Map byte to [-1, 1]
      out[i + j] = digest[j]! / 127.5 - 1;
    }
  }
  let norm = 0;
  for (const value of out) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) {
    out[i] = out[i]! / norm;
  }
  return out;
}

export function vectorLiteral(values: number[]): string {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSIONS}-d vector, got ${values.length}`,
    );
  }
  // pgvector accepts '[1,2,3]'::vector
  return `[${values.map((v) => (Number.isFinite(v) ? v : 0)).join(',')}]`;
}
