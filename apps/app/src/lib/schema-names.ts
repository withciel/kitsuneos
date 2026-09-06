/** Collection / property identifiers accepted by the console schema UI. */
export const SCHEMA_NAME_RE = /^[a-z_][a-z0-9_]*$/;

export function isValidSchemaName(name: string): boolean {
  return SCHEMA_NAME_RE.test(name.trim());
}
