# KitsuneOS v1 — System Design

**Status:** P0 surfaces implemented. Human console IA shipped. R9 semantic search (pgvector), reference graph, VFS, ingest, and R13 attachments (content-addressed blob store) are implemented.
**Date:** 3 September 2026
**Companion to:** KitsuneOS v1 PRD
**Scope:** P0 requirements R1–R8, R9 search + reference graph; architectural accommodation for P2 items R14–R17

---

## 1. Context

KitsuneOS is an application database humans and agents share. Humans use the hosted console; agents use MCP (and GraphQL / REST). Three things are native rather than bolted on:

1. **Revisions.** Every write is historical and attributed.
2. **Change sets.** A write can be proposed, reviewed, and applied atomically.
3. **Grants.** Access control is field- and row-scoped, stored as data, enforced in the database.

The hosted console is a first-class human workspace (collection tables, Inbox, Settings). Starter CRM collections (`accounts`, `contacts`, `opportunities`) live in that workspace so a human can operate records on day one. They use the same public API as any customer application — they are a demo schema, not a separate product.

The design goal that governs every trade-off below: **be genuinely relational.** If a developer's second query is "pipeline by stage this quarter" and we answer it slowly or not at all, none of the interesting primitives ever get used. Section 12 (ADR-002) is where this is decided.

---

## 2. Requirements

### Functional

- Typed collections with scalar, relation, and prose fields; referential integrity enforced in storage
- Filter, sort, paginate, and aggregate with grouping across at least one join
- Full revision history per record, queryable by record, principal, and time
- Change sets: field-level operations across multiple records and collections, applied atomically, with base-revision optimistic concurrency and partial approval
- Grants: principal × collection × capability × field mask × row predicate
- Rollup fields: stored number columns maintained from child aggregates; not writable by principals
- MCP server with permission-aware schema description
- Generated GraphQL, REST, and typed TypeScript client
- Immutable audit log including denied attempts

### Non-functional

| Property | Target | Notes |
|---|---|---|
| Read latency | p95 < 100ms single record, < 200ms grouped aggregate over one join | Measured at the API boundary |
| Change-set apply | p95 < 500ms for a set of ≤ 50 operations | Includes conflict detection |
| Write durability | No acknowledged write lost | Synchronous commit |
| Consistency | Strong within a workspace | No cross-workspace transactions in v1 |
| Availability | 99.5% v1 | Single-region; not yet an enterprise promise |
| Isolation | Zero cross-workspace and zero cross-grant data exposure | The one property with no acceptable failure rate |
| Query overhead vs hand-written SQL | < 2x on the ten reference query shapes | Gate before beta (PRD A4) |

### Constraints

- Small team, roughly 20 weeks to beta
- Managed Postgres and object storage only; no bespoke storage engine
- Single region for v1
- Team is strongest in TypeScript and Postgres, which should shape technology choices rather than ambition

---

## 3. High-Level Architecture

```
                       ┌──────────────────────────────────────┐
   Humans ──console──► │                                      │
   (tables, Inbox,     │            API Gateway               │
    Settings)          │   authn · rate limit · routing       │
                       └───────────────────┬──────────────────┘
   Agents ────MCP────►                     │
   (Claude, Codex,                         ▼
    other)             ┌──────────────────────────────────────┐
   Applications ──────►│          Query Compiler              │
   (GraphQL / REST /   │  grant resolution → SQL predicates   │
    CLI)               │  column projection · shape validation│
                       └───────┬─────────────────┬────────────┘
                               │                 │
                     ┌─────────▼──────┐  ┌───────▼─────────────┐
                     │  Read Path     │  │  Change Set Engine  │
                     │  GraphQL/REST  │  │  validate·conflict· │
                     │  aggregates    │  │  apply (1 txn)      │
                     └─────────┬──────┘  └───────┬─────────────┘
                               │                 │
                       ┌───────▼─────────────────▼───────┐
                       │           Postgres              │
                       │  ┌───────────────────────────┐  │
                       │  │ control plane (kitsune.*)  │ │
                       │  │ workspaces·principals·     │ │
                       │  │ collections·fields·grants· │ │
                       │  │ change_sets·change_ops·    │ │
                       │  │ audit_log                  │ │
                       │  └───────────────────────────┘  │
                       │  ┌───────────────────────────┐  │
                       │  │ data plane (ws_<id>.*)     │ │
                       │  │ real generated tables +    │ │
                       │  │ __rev history              │ │
                       │  │ (pgvector embeddings: P1)  │ │
                       │  └───────────────────────────┘  │
                       └────────────────┬────────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │  Object Storage (R2/S3)     │
                         │  attachments, cold revision │
                         │  archives — content-addressed│
                         └─────────────────────────────┘

                         ┌─────────────────────────────┐
                         │  Embedding Worker (async)   │
                         │  prose fields → pgvector    │
                         └─────────────────────────────┘
```

Two things worth noting about this shape. There is exactly one authorization implementation, in the query compiler, shared by every API surface — a second implementation is how leaks happen. And object storage is demoted from the original sketch: it holds attachments and cold archives, not primary records. Records are rows.

---

## 4. Data Model

### 4.1 Tenancy

One Postgres schema per workspace (`ws_<uuid>`), containing real generated tables. Control-plane metadata lives in a shared `kitsune` schema.

This gives real indexes, real foreign keys, real query planning, and real aggregates. It costs table sprawl, which is the accepted trade (ADR-002) and the main scaling limit (Section 9).

### 4.2 Control plane

```sql
CREATE TABLE kitsune.workspaces (
  id            uuid PRIMARY KEY,
  slug          text UNIQUE NOT NULL,
  schema_name   text NOT NULL,          -- ws_<id>
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kitsune.principals (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  kind          text NOT NULL CHECK (kind IN ('human','agent','service')),
  display_name  text NOT NULL,
  acts_for      uuid REFERENCES kitsune.principals(id),  -- delegation, see Q4
  disabled_at   timestamptz
);

CREATE TABLE kitsune.collections (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  name          text NOT NULL,
  table_name    text NOT NULL,
  schema_version int NOT NULL DEFAULT 1,
  revision_retention_days int,  -- NULL = keep forever; admin sweeper deletes expired __rev rows
  UNIQUE (workspace_id, name)
);

CREATE TABLE kitsune.fields (
  id              uuid PRIMARY KEY,
  collection_id   uuid NOT NULL REFERENCES kitsune.collections(id),
  name            text NOT NULL,
  type            text NOT NULL,   -- text|number|boolean|timestamp|enum|relation|prose
  nullable        boolean NOT NULL DEFAULT true,
  relation_target uuid REFERENCES kitsune.collections(id),
  relation_kind   text,            -- many_to_one | one_to_many
  enum_values     text[],
  indexed         boolean NOT NULL DEFAULT false,
  UNIQUE (collection_id, name)
);

CREATE TABLE kitsune.grants (
  id            uuid PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES kitsune.workspaces(id),
  principal_id  uuid NOT NULL REFERENCES kitsune.principals(id),
  collection_id uuid NOT NULL REFERENCES kitsune.collections(id),
  capability    text NOT NULL CHECK (capability IN
                  ('none','read','propose','write','admin')),
  field_mask    text[],   -- NULL = all fields
  row_predicate jsonb,    -- NULL = all rows; compiled, never interpolated
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);
CREATE INDEX ON kitsune.grants (principal_id, collection_id)
  WHERE revoked_at IS NULL;

CREATE TABLE kitsune.schema_revisions (
  id              uuid PRIMARY KEY,
  collection_id   uuid NOT NULL REFERENCES kitsune.collections(id),
  version         int NOT NULL,
  op              text NOT NULL,   -- addField | dropField | setIndexed
  payload         jsonb NOT NULL,
  ddl_up          text NOT NULL,
  ddl_down        text NOT NULL,
  applied_at      timestamptz NOT NULL DEFAULT now(),
  reverted_at     timestamptz,
  UNIQUE (collection_id, version)
);
```

`row_predicate` is a structured JSON expression (field, operator, value), never a SQL string. It is compiled to parameterised SQL by the query compiler. Accepting SQL strings here would be an injection vector directly into the authorization layer.

### 4.3 Change sets

```sql
CREATE TABLE kitsune.change_sets (
  id             uuid PRIMARY KEY,
  workspace_id   uuid NOT NULL,
  author_id      uuid NOT NULL REFERENCES kitsune.principals(id),
  status         text NOT NULL CHECK (status IN
                   ('open','blocked','applied','rejected','stale','expired')),
  title          text,
  rationale      text,           -- agents explain themselves; reviewers read this first
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz,
  decided_by     uuid REFERENCES kitsune.principals(id),
  expires_at     timestamptz NOT NULL DEFAULT now() + interval '30 days'
);

CREATE TABLE kitsune.change_ops (
  id             uuid PRIMARY KEY,
  change_set_id  uuid NOT NULL REFERENCES kitsune.change_sets(id),
  collection_id  uuid NOT NULL REFERENCES kitsune.collections(id),
  record_id      uuid,           -- NULL for inserts
  op             text NOT NULL CHECK (op IN ('insert','update','delete')),
  field_name     text,           -- NULL for insert/delete of whole record
  base_revision  bigint,         -- revision this op was authored against
  new_value      jsonb,
  status         text NOT NULL DEFAULT 'proposed'
                   CHECK (status IN ('proposed','approved','rejected','conflicted')),
  seq            int NOT NULL
);
CREATE INDEX ON kitsune.change_ops (change_set_id, seq);
CREATE INDEX ON kitsune.change_ops (collection_id, record_id)
  WHERE status IN ('proposed','approved');
```

**The single most important shape decision in this document:** operations are field-level, not record-level. That is what makes two agents editing different fields of one record a non-conflict, and it is the precondition for R14's merge queue. Record-level diffs would make R14 a rewrite (PRD §6, P2).

`rationale` is deliberate. A reviewer facing twenty machine-authored change sets reads the explanation before the diff, and its quality is the difference between review and rubber-stamping.

### 4.4 Data plane — generated tables

For a collection `opportunities`:

```sql
CREATE TABLE ws_abc.opportunities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES ws_abc.accounts(id)
                 DEFERRABLE INITIALLY DEFERRED,
  name         text NOT NULL,
  amount       numeric(14,2),
  stage        text NOT NULL,
  next_step    text,                      -- prose field
  _revision    bigint NOT NULL DEFAULT 1,
  _updated_at  timestamptz NOT NULL DEFAULT now(),
  _updated_by  uuid NOT NULL,
  _deleted_at  timestamptz
);
CREATE INDEX ON ws_abc.opportunities (account_id) WHERE _deleted_at IS NULL;
CREATE INDEX ON ws_abc.opportunities (stage)      WHERE _deleted_at IS NULL;

CREATE TABLE ws_abc.opportunities__rev (
  record_id      uuid NOT NULL,
  revision       bigint NOT NULL,
  snapshot       jsonb NOT NULL,        -- full row after this revision
  changed_fields text[] NOT NULL,
  change_set_id  uuid,
  principal_id   uuid NOT NULL,
  valid_from     timestamptz NOT NULL,
  PRIMARY KEY (record_id, revision)
);
CREATE INDEX ON ws_abc.opportunities__rev (principal_id, valid_from);
```

Foreign keys are `DEFERRABLE INITIALLY DEFERRED` so a change set can create an account and an opportunity referencing it in any order within one transaction.

History stores a full snapshot rather than a delta. Snapshots cost more space and are robust to schema evolution; deltas are compact and become very painful to replay across a schema change. `changed_fields` gives field-level provenance without replaying the chain, and it is what conflict detection reads.

`_revision` is a per-record counter, not a global one. Optimistic concurrency is per record.

---

## 5. Access Control

### 5.1 Resolution

For a principal and collection, the effective grant is the union of non-revoked grants:

- **Capability:** the highest on the ladder `none < read < propose < write < admin`
- **Field mask:** union of masks; a `NULL` mask in any grant means all fields
- **Row predicate:** disjunction (OR) of predicates; a `NULL` predicate in any grant means all rows

No matching grant denies. There is no implicit inheritance and no wildcard default.

Per PRD Q1, agent principals are capped at `propose` unless explicitly overridden by a workspace admin with an audit event. Direct agent writes should be a deliberate, visible exception rather than the easy path.

### 5.2 Enforcement — two layers

**Primary: predicate injection in the query compiler.** Every request resolves to (principal, collection, requested fields, filters). The compiler emits SQL with the row predicate as a parameterised `WHERE` clause and an explicit column list derived from the field mask. There is no `SELECT *` anywhere in the system.

This is fast — predicates are ordinary indexed conditions the planner understands — and correct by construction, provided the compiler is the only path to the data plane.

**Backstop: Postgres RLS.** Every data-plane table has RLS enabled with a cheap policy enforcing workspace isolation and soft-delete visibility, keyed off `current_setting('kitsune.principal_id')` set via `SET LOCAL` inside each transaction. `SET LOCAL` is compatible with transaction-mode connection pooling; session-level `SET` is not, which matters because pgbouncer is in the path (Section 9).

RLS is deliberately *not* used for the full row predicate. Evaluating an arbitrary grant predicate per row through a function call defeats the planner and turns index scans into sequential scans. RLS catches the catastrophic class of bug — a query that escaped the compiler entirely — while the compiler handles the expressive part.

**Non-negotiable test requirement.** Every query shape runs in CI as every principal class, asserting exact result sets. Authorization correctness is the one property in Section 2 with a target of zero, and it is not achievable by code review alone.

### 5.3 Field masks in aggregates

A field mask must apply to aggregates, not only to row reads. If a principal cannot read `amount`, it cannot `SUM(amount)` either — otherwise the aggregate is an oracle for the masked field. The compiler rejects aggregate expressions over masked fields rather than silently returning null.

Small-cardinality aggregates leak too: a `SUM` over a group of one reveals the value. v1 rejects masked-field aggregates outright; differential-privacy-style thresholds are out of scope and probably always will be.

---

## 6. Change Set Mechanics

### 6.1 Creation

1. Resolve the author's grant for each `(collection, field)` in the set.
2. Reject the entire set if any operation touches a field outside the mask or a row outside the predicate, naming the offending field. Failing loudly at creation is worth more than partial acceptance — a misconfigured agent should stop, not accumulate unmergeable work (PRD story 6).
3. Capture `base_revision` per operation from the current record state.
4. Persist as `open`.

### 6.2 Apply

```
BEGIN;
SET LOCAL kitsune.principal_id = <reviewer>;

-- 1. Deterministic lock ordering prevents deadlock between
--    concurrent change sets touching overlapping records.
SELECT ... FROM <each collection> WHERE id = ANY(...)
  ORDER BY (collection_id, record_id) FOR UPDATE;

-- 2. Re-check grants for the AUTHOR, not the reviewer.
--    A grant revoked since creation invalidates the set (PRD story 8).
FOR each op:
    IF NOT grant_allows(author, op.collection, op.field) THEN
        ROLLBACK; mark change_set 'blocked'; RETURN;

-- 3. Field-level conflict detection.
FOR each op:
    current := record._revision
    IF current = op.base_revision THEN
        clean
    ELSE
        touched := UNION(changed_fields) FROM <coll>__rev
                   WHERE record_id = op.record_id
                     AND revision > op.base_revision
        IF op.field = ANY(touched) THEN
            mark op 'conflicted'
        ELSE
            clean   -- disjoint fields: no conflict
        END IF

-- 4. Any conflict blocks the whole set. Atomicity is the promise;
--    partial application on conflict would break it.
IF any op conflicted THEN
    ROLLBACK; mark change_set 'blocked'; surface conflicts; RETURN;

-- 5. Apply approved ops, bump _revision, write __rev snapshots.
-- 6. Deferred FK constraints validate here, at COMMIT.
COMMIT;
```

Step 3 is the payoff of field-level operations. Two agents updating `stage` and `next_step` on one opportunity both apply cleanly. A line-oriented or record-oriented model would conflict on both.

Step 2 checks the *author's* grants at apply time, not the reviewer's. A reviewer approving a change set does not launder permissions the author never had.

### 6.3 Partial approval

Per PRD Q2, the reviewable unit is the operation and the atomic unit is the change set. A reviewer marks individual operations `approved` or `rejected`; apply processes only approved ones, still atomically. Rejected operations are retained with their comments so the authoring agent can read the feedback (PRD story 12).

### 6.4 Expiry

Change sets expire after 30 days. Without expiry, a workspace accumulates thousands of stale proposals against long-moved base revisions, and the review queue — the product's core human surface — becomes unusable.

---

## 7. Query and API Layer

There is still exactly one query compiler. GraphQL, REST, MCP, the console query runner, and the CLI all call `KitsuneEngine` methods; none talk to Postgres directly.

**Engine / MCP pagination** uses `limit` and `offset` on `QueryRequest`.

**GraphQL** is generated per request from `describeSchema` for that workspace (workspace from session or API key, never from the query body). Yoga serves `POST /api/graphql`. A type per collection; relation fields as nested selections resolved with DataLoader-batched `engine.query` (not per-node SQL); connection pagination (`first` / `after` id cursor — offset is not exposed); `<collection>Aggregate(groupBy, join, aggregates)` maps 1:1 to `engine.query`.

**REST** is `GET /api/records/:collection/:id` (`readRecord` only). Missing and forbidden both return `{ "error": "Not found" }`. Writes of business data still go through change sets.

**MCP** exposes `describe_schema`, `query` (including `join`), `read_record`, `propose_change_set`, and `read_change_set_feedback`. `describe_schema` returns only what the calling identity can reach, including its own capabilities per field.

**TypeScript client** is generated from collection definitions (`pnpm codegen`, `--check` in CI). Types fail the build on incompatible schema change. Types come from `kitsune.fields`, not from GraphQL SDL.

Per PRD Q8: raw SQL is not exposed. It would bypass the compiler, and the compiler is the authorization layer.

---

## 8. Search

R9 is implemented: pgvector in the same database as the data, with grants applied inside the query (ADR-004).

```sql
CREATE TABLE ws_abc.opportunities__emb (
  record_id   uuid NOT NULL,
  field_name  text NOT NULL,
  chunk_idx   int  NOT NULL,
  content     text NOT NULL,
  embedding   vector(1536) NOT NULL,
  indexed_at  timestamptz NOT NULL,
  PRIMARY KEY (record_id, field_name, chunk_idx)
);
CREATE INDEX ON ws_abc.opportunities__emb
  USING hnsw (embedding vector_cosine_ops);
```

Search joins the embedding table to the base table so the row predicate and field mask apply *inside* the query rather than as a post-filter. Post-filtering is both a correctness problem — result counts leak the existence of rows the principal cannot see — and a recall problem, since fetching the top 100 and discarding 90 gives poor results.

**Filtered ANN strategy.** HNSW recall degrades under selective filters. The compiler estimates the candidate set size from the predicate: below roughly 10,000 rows it performs an exact scan over the filtered set; above that it uses HNSW with an over-fetch factor and verifies against the predicate, iterating if the result set is short.

Embeddings are generated via an injectable `Embedder`. Default is `createDefaultEmbedder()`: deterministic hash for CI/local, or `OpenAIEmbedder` (`text-embedding-3-small`, 1536-d via `fetch`) when `KITSUNE_EMBEDDING_PROVIDER=openai` and `OPENAI_API_KEY` are set. Records carry `indexed_at`, and search results indicate when a record's prose has changed since it was last embedded. Stale-but-honest beats blocking writes on an embedding call.

MCP tool: `search`. Reference-graph neighbors: `engine.listRelated` / MCP `read_related`.

---

## 9. Scale and Limits

### Design-partner scale (the near-term target)

| Dimension | Estimate |
|---|---|
| Workspaces | 50 |
| Collections per workspace | ~20 |
| Physical tables | 50 × 20 × 3 (base + rev + emb) ≈ 3,000 |
| Records | ~1M total |
| Revisions | ~10M, ~2KB snapshot ≈ 20GB |
| Embedding vectors | ~3M |
| Peak read QPS | ~500 aggregate |

**Physical tables** at partner scale include embeddings. Each collection is three tables (base + `__rev` + `__emb`).

Comfortably one Postgres instance with a read replica. **Nothing here is a scale problem.** The hard problems at this stage are correctness — authorization leakage and merge semantics — not throughput, and effort should be allocated accordingly.

### Where it breaks

**Table count.** Schema-per-workspace means table count grows linearly with tenants. Around 40,000 tables (roughly 700 workspaces at 20 collections) Postgres catalog operations, autovacuum scheduling, and `pg_dump` become painful. **This is the primary scaling limit and it arrives well before any data-volume limit.**

*Mitigation path, in order:* (1) database-per-workspace on a managed provider with cheap provisioning, which also makes R15 branching nearly free; (2) shard workspaces across instances — straightforward because v1 has no cross-workspace queries, which is precisely why R16 federation is P2.

**Connections.** pgbouncer in transaction pooling mode. This is why authorization context uses `SET LOCAL` within a transaction rather than session GUCs.

**Revision growth.** Revision tables outgrow base tables by an order of magnitude. Partition `__rev` by month; archive partitions older than the retention window to object storage as compressed segments, restorable on demand.

**Change-op index.** The partial index on proposed operations must stay small. Expiry (§6.4) is load-bearing for query performance, not just hygiene.

---

## 10. Failure Modes

| Failure | Handling |
|---|---|
| Partial change-set application | Impossible by construction — one transaction, deferred FKs |
| Deadlock between concurrent applies | Deterministic lock ordering by `(collection_id, record_id)`; retry once with backoff |
| Grant revoked mid-apply | Author grants re-checked inside the transaction (§6.2 step 2) |
| Attachment written, record write fails | Blobs are content-addressed and written first; orphans are collected by a sweep — safe because addressing is by content |
| Embedding worker down | Writes proceed; search returns stale results flagged by `indexed_at` |
| Schema migration with open change sets | Migration validates open sets against the new schema and marks incompatible ones `stale` with a reason before applying (PRD story 18) |
| Change set references deleted record | Fails at apply with a clear error; never resurrects (PRD story 16) |
| Query compiler bug leaking rows | RLS backstop plus the CI authorization matrix (§5.2) |
| Runaway agent creating change sets | Per-principal rate limits at the gateway; change-set creation is a rate-limited operation |

---

## 11. Observability

Instrument from day one, including metrics nothing consumes yet:

- **Field-conflict rate per change set** — decides whether R14 leaves P2 (PRD A3)
- **Apply rate and time-to-decision** — the health band, not the maximum (PRD §7)
- **Reviewer load per human per week** — the metric most likely to kill the product quietly
- **Grant denial rate by principal** — misconfiguration detector
- **Query shape latency vs the hand-written SQL baseline** — the PRD A4 gate
- **Aggregate rejection rate due to field masks** — if high, the masking model is too coarse

---

## 12. Architecture Decision Records

### ADR-001: Relational-first with an attached prose field

**Status:** Accepted · **Deciders:** Product, Engineering

**Context.** The original concept stored knowledge as markdown files with frontmatter in object storage. The product then changed: applications, including a CRM, are built *on* KitsuneOS. CRM data is relational and transactional — opportunities have amounts, stages, and foreign keys — and the first queries a developer writes are aggregates and joins.

**Decision.** Records are typed rows. A prose markdown field is an optional column on a record, semantically indexed. Documents are a special case of records, not the other way round.

**Options considered.**

| | Document-first (markdown + frontmatter) | Relational-first (rows + prose field) |
|---|---|---|
| Complexity | Low | Medium |
| Aggregates and joins | Absent; must be rebuilt | Native |
| Referential integrity | None | Native |
| Fit for CMS/wiki apps | Excellent | Good |
| Fit for CRM/ops apps | Poor | Excellent |
| Merge semantics | Line-level, conflict-prone | Field-level, mostly conflict-free |

**Trade-off.** Document-first is simpler and matches the original vision, but a developer building anything transactional hits the wall in week one. Relational-first is harder to build and puts us against Postgres and Supabase, which is a stronger competitive set — but it is the only version where the platform thesis holds.

**Consequences.**
- *Easier:* aggregates, integrity, typed clients, and field-level merge — which pulls the concurrency story from research toward engineering.
- *Harder:* competing on developer experience with excellent free incumbents. Query performance becomes an existential requirement, not a nice-to-have.
- *Revisit if:* adoption concentrates entirely on document-shaped applications, in which case a document-optimised profile over the same engine is the response — not a return to files.

### ADR-002: Real generated DDL, one schema per workspace

**Status:** Accepted · **Deciders:** Engineering

**Context.** User-defined collections must map to storage. The classic fork is real tables versus a generic `records` table with a `jsonb` payload.

**Decision.** Generate real DDL. One Postgres schema per workspace.

**Options.**

| | jsonb / EAV | Real DDL, schema per workspace | Real DDL, shared schema + tenant column |
|---|---|---|---|
| Complexity | Low | Medium | Medium |
| Index quality | Poor to fair | Excellent | Excellent |
| Referential integrity | Application-level | Native | Native, but collection names collide across tenants |
| Migration cost | None | Real DDL migrations | Real DDL migrations |
| Tenant scaling | Excellent | Limited by table count | Excellent |

**Trade-off.** jsonb scales to many more tenants and needs no migrations, but degrades exactly where ADR-001 says we cannot afford to degrade. Shared-schema loses because tenant-defined collection names collide. Schema-per-workspace buys query quality and pays in table count, which Section 9 shows arrives around 700 workspaces — a problem we would be fortunate to have, with a known migration path.

**Consequences.**
- *Easier:* everything about queries, and R15 branching becomes a schema copy.
- *Harder:* schema migrations are real DDL and must be online; table count is the ceiling.
- *Revisit at:* 500 workspaces. Plan the database-per-workspace move before hitting the wall, not after.

### ADR-003: Change sets as a pending-operation log

**Status:** Accepted · **Deciders:** Engineering

**Context.** Proposed-but-unapplied writes need to live somewhere without polluting live data.

**Decision.** Store change sets as a log of field-level operations in the control plane. Nothing touches data-plane tables until apply.

**Options.**

| | Pending-op log | Database branch per change set | Shadow rows with status column |
|---|---|---|---|
| Complexity | Medium | High | Low |
| Concurrent proposals | Excellent | Poor | Fair |
| Conflict granularity | Field | Row or page | Row |
| Query pollution | None | None | Every query must filter |
| Cost per proposal | Negligible | Significant | Low |

**Trade-off.** Branching is conceptually elegant and gives full isolation, but a workspace with fifty open agent proposals means fifty branches, and merging them is worse than the problem it solves. Shadow rows are cheapest to build and taint every query in the system forever. The op log gives field granularity, which ADR-001 identified as the differentiator.

**Consequences.**
- *Easier:* many concurrent proposals; partial approval; field-level conflict detection; R14 becomes reachable.
- *Harder:* an agent cannot read its own uncommitted state as though applied. If that turns out to be needed, it is a materialised overlay view, not a change of storage model.
- *Revisit if:* long-running agent tasks need genuine isolation, at which point branching returns as a complement rather than a replacement.

### ADR-004: pgvector, not a dedicated vector database

**Status:** Accepted for P1 · **not implemented in P0** · **Deciders:** Engineering

**Context.** The original sketch specified Pinecone. Semantic search must respect field masks and row predicates.

**Decision.** pgvector in the same Postgres instance as the records.

**Options.**

| | pgvector (same DB) | External vector DB |
|---|---|---|
| ACL-correct filtering | A join — trivially correct | Metadata mirroring, eventually consistent |
| Operational surface | One system | Two systems, two failure modes |
| Consistency | Transactional with records | Eventual; deletes can lag |
| Scale ceiling | ~10M vectors comfortably | Much higher |
| Cost at our scale | Marginal | A second bill |

**Trade-off.** The external option wins decisively on raw scale and loses decisively on the property that matters most: authorization correctness. Mirroring grants into a separate system means every grant change is a distributed consistency problem, and a lagging delete is a data leak. At 3M vectors (Section 9) the scale advantage is irrelevant.

**Consequences.**
- *Easier:* correct filtered search, one system to operate, transactional consistency between records and their embeddings.
- *Harder:* vector search competes with transactional load for the same resources; a read replica may be needed sooner.
- *Revisit at:* roughly 10M vectors per instance, or when vector query load measurably degrades transactional latency.

### ADR-005: Predicate injection primary, RLS as backstop

**Status:** Accepted · **Deciders:** Engineering, Security

**Context.** Grants have row predicates and field masks. Postgres RLS is the obvious enforcement mechanism.

**Decision.** The query compiler injects parameterised predicates and explicit column lists. RLS is enabled with cheap policies for workspace isolation and soft-delete only.

**Options.**

| | Compiler injection only | RLS only | Both (chosen) |
|---|---|---|---|
| Performance | Excellent — planner sees ordinary predicates | Poor — per-row function calls defeat index scans | Excellent |
| Bypass resistance | A compiler bug is a leak | Strong | Strong |
| Field masking | Native | Not RLS's job |  Native |
| Complexity | Low | Medium | Medium |

**Trade-off.** RLS alone cannot express field masks and destroys query plans when predicates require function calls. Compiler injection alone means a single missed code path is a breach. Layering costs a little complexity and removes the catastrophic failure mode.

**Consequences.**
- *Easier:* fast queries with a hard floor under authorization bugs.
- *Harder:* two mechanisms to keep in sync; the CI authorization matrix (§5.2) becomes mandatory rather than nice to have.
- *Revisit if:* the compiler's predicate language grows expressive enough that keeping RLS coarse becomes misleading about the guarantee it provides.

---

## 13. What to Revisit as This Grows

**Around 500 workspaces.** Begin the move to database-per-workspace before table count becomes acute (ADR-002). Doing this early also makes R15 branching close to free.

**When field-conflict rate exceeds 10%.** R14's merge queue leaves P2. The data model already supports it; this is a scheduling decision, not an architectural one.

**When reviewer load exceeds 25 per person per week.** Human review has become the bottleneck and R11's automation policies become urgent. The product has moved work rather than removed it.

**When aggregate rejections from field masks are common.** The masking model is too coarse and needs either column-group grants or a redaction mode.

**When a design partner needs cross-workspace queries.** R16 arrives, and it invalidates the sharding assumption in Section 9. Push back hard before accepting this.

**When the first customer asks for self-hosting.** Audit the dependency surface then, and keep it small until that day.
