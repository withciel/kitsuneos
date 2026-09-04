# Information Layer Capabilities — Design

**Date:** 2026-09-03  
**Status:** Approved by product brief (build order locked)  
**Companion to:** `docs/prd.md` R9/R13, `docs/system-design.md` §8 + ADR-004

## Goal

Make the architecture diagram true as capabilities on the **existing** KitsuneOS engine:

| Diagram box | Capability | Store |
|---|---|---|
| Left (CMS/CRM/KB/Tickets) | Ingest importers | Upsert into collections via engine |
| Center | Existing engine | Postgres rows + revisions |
| Right (MCP) | Existing + new tools | Same grants |
| Bottom (search / graph / VFS) | Views over rows | pgvector emb tables + path projection — **not** new primary stores |

## Product locks

- Source of truth = Postgres collections/rows (not markdown in object storage).
- Vector search = **pgvector in the same database** (ADR-004). No Pinecone.
- Agents default `propose`; humans with write/admin direct-write.
- One query compiler + grants for every surface.
- Console: table views only; dark near-black + orange.
- Starter CRM = demo schema only.
- No marketing site redesign.

## Slice order

1. **Semantic search (R9)** — this PR with graph
2. **Reference graph** — this PR with search
3. **Virtual filesystem** — follow-up PR
4. **Ingest connectors** — follow-up PR
5. **Attachments (R13)** — follow-up PR

---

## 1. Semantic search

### Data model

Per collection, DDL emits `<table>__emb`:

```sql
CREATE TABLE ws_*.<collection>__emb (
  record_id   uuid NOT NULL,
  field_name  text NOT NULL,
  chunk_idx   int  NOT NULL,
  content     text NOT NULL,
  embedding   vector(1536) NOT NULL,
  indexed_at  timestamptz NOT NULL,
  PRIMARY KEY (record_id, field_name, chunk_idx)
);
-- HNSW cosine index
```

Bootstrap: `CREATE EXTENSION IF NOT EXISTS vector` in `scripts/db-init.sql` (superuser). Docker/CI images: `pgvector/pgvector:pg16`.

### Embedding provider

Injectable on `KitsuneEngine` (via `createDefaultEmbedder()` when omitted):

- `DeterministicEmbedder` (default / CI / local without keys): stable hash → unit vector dim 1536. Same text → same vector so search is deterministic.
- `OpenAIEmbedder` when `KITSUNE_EMBEDDING_PROVIDER=openai` + `OPENAI_API_KEY`. Uses `text-embedding-3-small` at 1536-d (override with `KITSUNE_EMBEDDING_MODEL` / `KITSUNE_EMBEDDING_BASE_URL`). No OpenAI SDK dependency — plain `fetch`.

Chunking v1: one chunk per prose field (no sliding window). Fields of type `prose` only.

### Indexing

- After `directWrite` / successful `applyChangeSet` that touches prose: reindex those records (sync when `embedSync: true` or DeterministicEmbedder; otherwise enqueue `kitsune.embedding_jobs` and process via `processEmbeddingJobs`).
- Public `reindexRecord(workspaceId, collection, recordId)` for CLI/tests.
- Search results include `stale: true` when base `_updated_at` > emb `indexed_at`.

### Engine API

```ts
search(workspaceId, principalId, {
  query: string;
  collections?: string[];  // default: all readable with ≥1 prose field in mask
  limit?: number;          // default 10
}): Promise<{
  hits: Array<{
    collection: string;
    recordId: string;
    fieldName: string;
    score: number;
    excerpt: string;       // only if field in caller's field mask
    stale: boolean;
  }>;
}>
```

### Grant enforcement (inside SQL)

1. Resolve grant per candidate collection; skip capability `< read` (collection absent from results — no error leak).
2. Field mask: only emb rows where `field_name` ∈ readable prose fields (or all prose if mask null).
3. Join emb → base on `record_id`; apply `rowPredicate` + `_deleted_at IS NULL` in WHERE.
4. Order by cosine distance; never post-filter for auth.

### MCP

Tool `search` — args `{ query, collections?, limit? }`. No `workspaceId`.

### Acceptance

- Masked prose field never appears in `fieldName` / `excerpt`.
- Collection with `none` / no grant absent from hits.
- Revoke grant → immediate next search excludes that collection.
- Row predicate excludes denied rows from hits (and does not leak via count).

---

## 2. Reference graph

### Engine API

```ts
listRelated(workspaceId, principalId, collection, recordId): Promise<{
  outgoing: Array<{ field: string; collection: string; recordId: string; label: string | null }>;
  incoming: Array<{ field: string; collection: string; recordId: string; label: string | null }>;
}>
```

- Outgoing: relation fields on the record whose targets the caller can `read`.
- Incoming: scan collections the caller can read for relation fields targeting this collection; query rows where FK = recordId (indexed relation columns — no full-table filter scan of unrelated collections; use `WHERE fk = $1`).
- Invisible targets / denied collections omitted (existence-hiding).
- Label: prefer `name` → `title` → `email` → truncated id when those fields are readable.

### MCP

Tool `read_related` — `{ collection, recordId }`.

### Console

Record peek section **Related**: list outgoing/incoming as labels linking to `/c/<collection>` (table view only — no canvas). Uses `POST /api/related`.

---

## 3. Virtual filesystem — **this PR**

Read-only paths `/<collection>/<recordId>/<field>.md` (prose) and `.json` (other). MCP/CLI `ls` + `read`. Writes still propose/direct-write. No FUSE in v1.

### Ingest

Shared `ingest(workspaceId, principalId, { collection, records, mode })` → propose or directWrite by capability. CLI `kitsune ingest --source {cms|crm|kb|tickets} …`. Folder/CSV/JSON only; no vendor SDKs.

### Attachments

Content-addressed blobs via `BlobStore` (local dir by default under `KITSUNE_BLOB_DIR`; S3/R2 can plug the same interface). Metadata in `kitsune.attachments`. Engine: `putAttachment` / `listAttachments` / `getAttachment`. MCP: `put_attachment`, `list_attachments`, `get_attachment`. Field grants gate metadata and download; records stay in Postgres.

---

## Out of scope

Rollups, webhooks, automation, Pinecone, production self-host, landing page, PRD positioning rewrite, SHA-pinning CI.
