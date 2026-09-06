/**
 * Allow only same-origin relative return paths (open-redirect guard).
 * Accepts path + query + hash; rejects protocol-relative and absolute URLs.
 */
export function safeReturnTo(
  value: string | null | undefined,
  fallback = '/',
): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }
  // Block backslash tricks / encoded absolute URLs.
  if (trimmed.includes('\\') || /^\/[a-z]+:/i.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}
