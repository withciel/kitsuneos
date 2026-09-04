# KitsuneOS v1 — Product Requirements Document

**Status:** P0 implemented against acceptance tests (2026-09-02). P1 unbuilt.
**Date:** 2 September 2026
**Supersedes:** document-first draft (same date)
**Positioning:** The application database for software that AI agents write to.

---

## 0. Evidence Status

Written without user research. No interviews, no usage data, no design partners yet. Every claim about developer pain below is a team hypothesis, not a finding.

Numbers in Section 7 are predictions made so we can be wrong in public, not commitments. Section 9 ranks the assumptions by how much damage a wrong answer does and names the cheapest test for each. A1 and A2 should be tested during the build, not after it.

This matters more than usual here, because the relational framing moves us from competing with a git repo to competing with Postgres, Supabase, and Convex. That is a much stronger competitive set and a much less forgiving buyer.

---

## 1. Problem Statement

Developers are starting to build applications where an AI agent is a writer, not just a reader. The database underneath was designed on the assumption that writes come from application code that a human reviewed before deploying.

That assumption breaks in three specific places.

**Permissions live in the app, not the data.** Postgres row-level security can scope rows, but field-level control and the policy language around it get reimplemented in every application. When the writer is an agent rather than a code path, every application has to solve agent authorization from scratch, and each one solves it differently and incompletely.

**Writes are immediate and unreviewable.** There is no native concept of a proposed change. Teams that want an agent's work reviewed before it lands build a bespoke staging table, a status column, and an approval UI — the same three things, badly, in every product.

**History is an afterthought.** Audit tables are bolted on when compliance asks. "What did this record look like before the agent touched it, and which agent touched it" is a question most schemas cannot answer without forensic work.

The workaround is that every team building an agent-facing application reimplements the same staging, permission, and provenance layer over Postgres. That layer is roughly the same every time, it is security-critical, and nobody owns it as a product.

**Cost of not solving it.** Teams either give agents direct write access to production data, which is the incident nobody wants to write up, or they keep agents read-only and lose most of the value. The middle path exists but costs weeks per application.

---

## 2. Target Users

**Primary — the application developer building agent-facing software.** Small team or solo, building a product where agents read and write business records. Chooses their backend at project start and will not migrate later. Currently reaches for Supabase, Convex, or plain Postgres. This is the adopter and the buyer.

**Secondary — the platform engineer at a 50–500 person company** standardising internal agent tooling across several applications. Cares about audit and blast radius more than developer velocity. This user arrives later but pays more.

**Not a v1 user — the end user of applications built on KitsuneOS.** They never see us. Their experience is mediated entirely by the application developer, which means our UI surface in v1 is a schema browser and a review queue, not an end-user product.

---

## 3. Goals

| # | Goal | Measure | Prediction |
|---|------|---------|-----------|
| G1 | A developer can model real relational data and get real query behaviour | Workspaces with ≥ 3 collections and ≥ 1 relation; aggregate queries served | ≥ 70% of active workspaces; p95 aggregate < 200ms |
| G2 | Agent writes land through review without the developer building a staging layer | Change sets created per active workspace per week; % applied | ≥ 20/week; ≥ 40% applied |
| G3 | Permissions are a property of the data, not the application | Workspaces using field-level or row-predicate grants | ≥ 60% of active workspaces by day 30 |
| G4 | History answers provenance questions without forensics | Revision queries served; % of workspaces that have run one | ≥ 40% have queried history by day 60 |
| G5 | The platform is credible enough to build on | Design partners with an application in production | 10 within 120 days of beta |

G1 is the make-or-break goal and it is deliberately unglamorous. If aggregates and relations are not genuinely good, a developer discovers it in week one and leaves, and none of the interesting primitives ever get exercised.

---

## 4. Non-Goals

**Not a general-purpose OLAP or analytics warehouse.** No columnar storage, no large scans, no BI workload. *Why:* it is a different engine and a different buyer, and chasing it compromises the transactional path we need.

**Not a hosted end-user application.** The CRM we build is a reference implementation (Section 5), not a product we sell. *Why:* see the tripwire below.

**No WYSIWYG or non-technical authoring surface.** The v1 human surfaces are a schema browser, a query console, and a change-set review queue. *Why:* our user is a developer; an editor targets an audience we do not serve yet.

**No content delivery, rendering, or CDN.** *Why:* that is the headless CMS product, which is one application someone could build on KitsuneOS rather than something KitsuneOS is.

**No production self-hosting in v1.** The product is the hosted app (`apps/app`). `pnpm quickstart` remains an eval preview and is unsupported for production. *Why:* support burden before product-market fit. Revisit when a real deal is blocked on it.

**No migration tooling from other databases.** *Why:* v1 adopters start new projects. Migration matters at a stage we are not at.

### The reference application, and when to stop

We build a small CRM to prove the platform: accounts, contacts, opportunities, activity notes, with an agent that drafts opportunity updates from meeting notes and proposes them for review. It exercises every primitive that matters — relations, aggregates over money, prose fields, field-level permissions, and agent-authored change sets.

**Tripwire.** The moment a prospect asks to buy the CRM, or an engineer spends a sprint on CRM features that do not exercise a platform primitive, we stop. Every infrastructure company that built a platform and a flagship application did one of them badly. The CRM's job is to be believable, then to be boring.

---

## 5. User Stories

### Application developer

1. As a developer, I want to define collections with typed fields and relations so that my data model has real referential integrity rather than untyped documents.
2. As a developer, I want aggregate queries across relations so that "pipeline by stage this quarter" is one query, not application code.
3. As a developer, I want an auto-generated typed client so that my application code does not hand-roll queries against a schema it cannot verify.
4. As a developer, I want to grant an agent write access to three fields on one collection so that I do not build an authorization layer myself.
5. As a developer, I want agent writes to arrive as reviewable change sets by default so that I do not build a staging table and an approval screen.
6. As a developer, I want a transaction spanning several collections to apply atomically so that a partially-applied change set cannot corrupt state.

### Platform engineer

7. As a platform engineer, I want every write attributed to a principal and retained in history so that I can answer what an agent changed during an incident.
8. As a platform engineer, I want to revoke an agent's grant and have open change sets it authored become unmergeable so that revocation is not bypassed by in-flight work.
9. As a platform engineer, I want denied access attempts logged so that a misconfigured agent is visible before it is a finding.

### Reviewer

10. As a reviewer, I want to see a field-level diff of a proposed change so that I can approve without reading the whole record.
11. As a reviewer, I want to approve part of a change set and reject the rest so that one bad field does not discard good work.
12. As a reviewer, I want to leave a comment the authoring agent can read so that the next attempt is better.

### Agent operator

13. As an agent operator, I want the agent to discover the schema and its own permissions over MCP so that I do not write a bespoke integration per collection.
14. As an agent operator, I want semantic search over prose fields that respects the agent's grants so that retrieval cannot leak fields the agent may not read.
15. As an agent operator, I want a change set to carry the record revisions it was authored against so that stale work is detected rather than silently overwriting newer data.

### Edge and failure cases

16. As a developer, I want a change set referencing a deleted record to fail loudly at apply time rather than resurrect it.
17. As a developer, I want two agents editing different fields of the same record to both apply without conflict.
18. As a developer, I want a schema change that would invalidate open change sets to warn me before it is applied.

---

## 6. Requirements

### P0 — Must have

**R1. Typed collections and relations**
Collections are defined by a schema: scalar fields (text, number, boolean, timestamp, enum), relation fields (foreign key to another collection, one-to-many and many-to-one), and an optional prose field (markdown body).

- Given a collection `opportunities` with a required relation to `accounts`
- When a write attempts to set that relation to a non-existent account
- Then the write is rejected with a referential integrity error, at apply time, before any part of the change set lands

Additional criteria:
- [x] Relations enforce referential integrity in the storage layer, not the application
- [x] Filter, sort, and paginate on any indexed scalar field
- [x] Aggregates (count, sum, avg, min, max) with grouping, across a single relation join
- [x] Schema changes are versioned and reversible (v1 ops: `addField`, `dropField`, `setIndexed`; no retype or rename)

**R2. Record revisions**
Every write produces a revision. Revisions record the principal, the change set that produced them, the timestamp, and the prior field values.

- [x] Any record's state at any past timestamp is retrievable
- [x] Revision history is queryable by principal and by record
- [x] Deletes are soft by default and appear in history
- [ ] Revision retention is configurable per collection (`revision_retention_days` exists; no sweeper yet)

**R3. Change sets**
A change set is a set of proposed field-level operations across one or more records and collections, authored against specific base revisions, applied atomically.

- Given a change set authored against revision 4 of a record, and revision 5 now exists
- When the changed fields do not overlap with what changed in revision 5
- Then the change set applies cleanly and produces revision 6
- And when the changed fields do overlap, the conflicting fields are surfaced and apply is blocked

Additional criteria:
- [x] Apply is atomic across all operations and all collections in the set
- [x] Operations touching fields outside the author's grants are rejected at creation
- [x] Grants are re-checked at apply time, not only at creation
- [x] A reviewer can approve a subset of operations and reject the remainder
- [x] Rejection comments are readable through the API by the authoring principal
- [x] Every applied change set is retrievable as a unit, not only as scattered revisions

**R4. Field- and row-scoped grants**
A grant binds a principal (human or agent identity) to a collection, a capability, a field mask, and an optional row predicate. Capability ladder: `none` < `read` < `propose` < `write` < `admin`.

- Given an agent with `propose` on `opportunities.{stage, next_step}` and a row predicate limiting it to open opportunities
- When it reads a closed opportunity
- Then the record is absent from results entirely
- And when it proposes a change to `amount`
- Then the change set is rejected at creation, naming the field

Additional criteria:
- [x] Row predicates are enforced in the database, not the application layer
- [x] Field masks apply to reads, writes, and aggregates (search is P1 and unbuilt)
- [x] Absence of a matching grant denies
- [x] Revoking a grant makes affected open change sets unmergeable

**R5. MCP server**
Tools: `describe_schema`, `query`, `read_record`, `propose_change_set`, `read_change_set_feedback`. `describe_schema` returns only the collections, fields, and capabilities the calling identity actually has, so an agent discovers its own permissions without a human writing an integration.

- [x] Every response is filtered by the calling identity's grants
- [x] Each agent identity has a distinct credential
- [x] Schema description reflects grants, not the full schema

**R6. Query API and generated client**
Auto-generated GraphQL from the schema, REST for single-record access, and a generated TypeScript client with types derived from collection definitions.

- [x] Types regenerate on schema change and fail the build on incompatibility
- [x] Same enforcement code path as MCP — no second implementation of authorization

**R7. Audit log**
Every read, write, denied attempt, grant change, and schema change, by principal.

- [x] Queryable by principal, collection, and time range
- [x] Immutable and separately retained from record history
- [x] Denied attempts included

**R8. Console and CLI**
Console: schema browser, query runner, change-set review queue, grant editor, audit search. CLI: `init`, `schema push`, `schema diff`, `query`, `changesets`, `export`.

- [x] Review queue shows field-level diffs
- [x] `export` produces the full workspace as portable data plus schema (grant-filtered for non-admins)

### P1 — Should have

P1 remaining (R10–R13): rollups, automation, webhooks, attachments. **R9 semantic search is implemented** (pgvector; grants inside the query).

**R9. Semantic search over prose fields.** Embeddings on prose fields via pgvector in the same database, with grants applied inside the search rather than as a post-filter, and field masks respected in returned excerpts.

**R10. Computed and rollup fields.** Derived values maintained by the platform, e.g. account-level pipeline totals.

**R11. Change-set automation policies.** Rules such as auto-apply when confidence is high and only these fields are touched, or require two approvals above a value threshold.

**R12. Webhooks and change streams.** Subscribe to applied change sets for downstream sync.

**R13. Attachments.** Binary blobs in object storage, referenced by content hash from a record field.

### P2 — Future considerations (design for, do not build)

**R14. Agent-tempo merge queue.** Ordered application of many concurrent change sets with automatic resolution where field sets are disjoint. *Architectural implication:* change sets must be field-level and carry per-operation base revisions from day one. If we build record-level diffs, this is a rewrite. **This is the single most important P2 constraint in the document.**

**R15. Branching.** Fork a workspace's data for a staging environment or a long-running agent task. *Architectural implication:* keep tenancy at the schema level so a branch is a schema copy, not a cross-cutting migration.

**R16. Cross-workspace federation.** *Architectural implication:* principals must be identifiable outside a single workspace.

**R17. Self-hosting.** *Architectural implication:* avoid dependencies on managed-service features that have no open equivalent.

---

## 7. Success Metrics

### Leading (days to weeks)

| Metric | Definition | Success | Stretch |
|---|---|---|---|
| Model depth | % of active workspaces with ≥ 3 collections and ≥ 1 relation | ≥ 70% | ≥ 85% |
| Time to first agent write | Median hours from signup to first agent-authored change set | < 4h | < 1h |
| Change-set volume | Agent-authored change sets per active workspace per week | ≥ 20 | ≥ 100 |
| Apply rate | Applied ÷ (applied + rejected) | 40–85% | 55–75% |
| Grant sophistication | % of workspaces using a field mask or row predicate | ≥ 60% | ≥ 80% |
| Aggregate latency | p95, grouped aggregate over one join | < 200ms | < 80ms |
| Field-conflict rate | % of change sets blocked by overlapping field edits | < 5% | < 2% |

The apply-rate band matters more than the number. Below 40% the agents are producing noise and taxing reviewers. Above 85% review is rubber-stamping and the control is decorative. Either end is a signal to change the product, not the target.

Field-conflict rate is the metric that tells us whether R14 is urgent. If it climbs above 10% at design-partner scale, the merge queue moves out of P2.

### Lagging (weeks to months)

| Metric | Definition | Success |
|---|---|---|
| Production applications | Design-partner apps serving real users at day 120 | ≥ 6 |
| Developer retention | Workspaces with writes in week 12 that also had them in week 1 | ≥ 50% |
| Reviewer load | Change sets reviewed per human reviewer per week | < 25 |
| Leakage incidents | Confirmed reads of fields or rows outside a grant | 0 |
| Support ratio | Support hours per active workspace per month | < 1h |

Reviewer load is the metric most likely to kill this quietly. If human review becomes the bottleneck, the product has moved the work rather than removed it, and R11 becomes urgent.

---

## 8. Open Questions

**Blocking — resolved for P0 (2026-09-02)**

| Q | Decision | Evidence |
|---|---|---|
| Q1 | Agent principals are capped at `propose` unless a workspace admin sets `adminOverrideAgentWrite`, which is audited. Direct agent writes are a deliberate, visible exception. | Acceptance test 20 |
| Q2 | The reviewable unit is the operation; the atomic unit is the change set. Reviewers mark ops `approved` or `rejected`; apply processes approved ops in one transaction. Apply is refused while any op remains `proposed`. | Tests 11, console partial-apply; system design §6.3 |
| Q3 | A row excluded by a predicate returns not-found, not forbidden. | Test 16 |
| Q4 | Agents are first-class principals (`kind = 'agent'`). `acts_for` exists on `kitsune.principals` and is unused. | Principals table; no delegation API |

**Non-blocking**

| Q | Question | Owner |
|---|---|---|
| Q5 | Do schema changes require a change set of their own, reviewed like data? | Product |
| Q6 | What is the default revision retention, and who pays for long retention? | Product + Finance |
| Q7 | Are prose fields one per collection or many? Many complicates search scoping. | Engineering |
| Q8 | Do we expose raw SQL to developers, or only the generated API? Raw SQL is a large escape hatch through the permission model. | Engineering |

Q8 deserves flagging as a strategic question wearing engineering clothes. Exposing SQL makes us feel like Postgres and bypasses the primitives that justify our existence. **v1 does not expose raw SQL.** GraphQL, REST GET, MCP, CLI query, and the engine query API all go through one compiler.

---

## 9. Assumption Register

Ordered by damage if wrong.

**A1 — Developers will adopt a new database for a new project.**
The hardest assumption in the document. Database adoption is slow, conservative, and lock-in-averse, and the incumbents are excellent and free.
*If wrong:* nothing else matters.
*Cheapest test:* put the reference CRM and a schema-to-running-app path in front of ten developers building agent applications. Measure whether they get to a first agent write in under an hour without help. Do this in week three, not after beta.

**A2 — Reviewable writes are the reason to switch, not a feature they would skip.**
*If wrong:* we are a worse Supabase with extra concepts.
*Cheapest test:* eight conversations with teams that already built a staging-and-approval layer over their own database. Ask how long it took and what it still does not do. Evidence of existing homemade versions is the strongest signal available and it is cheap to look for.

**A3 — Field-level conflict resolution is materially better than record-level for agent workloads.**
This is our main technical differentiator over both git-style and row-locking approaches.
*If wrong:* R14 stays a research problem and the concurrency story collapses.
*Cheapest test:* instrument field-conflict rate from day one and simulate three concurrent agents against the reference CRM before beta.

**A4 — Relational query performance will be good enough that nobody notices we are not raw Postgres.**
Every abstraction over a database eventually meets a query it serves badly.
*If wrong:* developers hit the wall in week one and leave, and G1 fails.
*Cheapest test:* benchmark the ten most common query shapes from the reference CRM against hand-written SQL. Publish the gap internally. Anything worse than 2x needs a fix before beta.

**A5 — Permissions-as-data is worth the modelling burden it imposes on developers.**
*If wrong:* developers grant `admin` to everything and our differentiator is unused.
*Cheapest test:* the grant-sophistication metric. If most workspaces run wide-open grants, the model is too hard or the value is not felt.

---

## 10. Phasing

**Phase 0 — Weeks 1–2.** Q1–Q4 are resolved (PRD §8). Schema and change-set data model design, since R14's constraint makes this expensive to get wrong. Begin A2's interviews in parallel.

**Phase 1 — Weeks 3–9.** R1, R2, R3, R4. The core: collections, revisions, change sets, grants. Nothing user-facing yet. Ends with A4's benchmark.

**Phase 2 — Weeks 10–14.** R5, R6, R7, R8. MCP, generated API and client, audit, console. Reference CRM built on the public API only, never on internal shortcuts — if the CRM needs a private path, that is a missing product requirement.

**Phase 3 — Weeks 15–20.** R9, R10, R11 as pulled by design partners. Beta.

**Dependencies.** None external.
**Hard deadlines.** None. The competitive pressure is that Convex and Supabase are both moving toward agent backends, so the window on "permissions and review as data primitives" is measured in quarters, not years.
