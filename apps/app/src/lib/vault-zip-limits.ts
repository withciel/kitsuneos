/** Browser MVP limits — larger vaults should use the CLI ingest path. */
export const VAULT_ZIP_LIMITS = {
  /** Maximum compressed upload size accepted by `/api/vault/import`. */
  maxUploadBytes: 8 * 1024 * 1024,
  /** Maximum number of entries in a single archive. */
  maxEntries: 500,
  /** Maximum total uncompressed bytes across all entries. */
  maxInflatedBytes: 32 * 1024 * 1024,
} as const;
