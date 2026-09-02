interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  maxRequests: 120,
  windowMs: 60_000,
};

export function checkRateLimit(
  keyId: string,
  options: RateLimitOptions = DEFAULT_OPTIONS,
): boolean {
  const now = Date.now();
  let bucket = buckets.get(keyId);
  if (!bucket) {
    bucket = { tokens: options.maxRequests, lastRefill: now };
    buckets.set(keyId, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  if (elapsed >= options.windowMs) {
    bucket.tokens = options.maxRequests;
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    return false;
  }

  bucket.tokens -= 1;
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}
