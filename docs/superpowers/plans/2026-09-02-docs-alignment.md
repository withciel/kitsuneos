# Docs Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update PRD, system design, README, and the marketing site so they describe what the acceptance tests actually prove after Plans 1–3.

**Architecture:** Docs-only. Tick P0 boxes that have tests. Record Q1–Q4 as decided. State hosted v1 with self-hosted preview as eval-only. Do not claim P1 features or production-under-Ciel unless still true.

**Tech Stack:** Markdown, existing `apps/site` page.

## Global Constraints

- Do not tick a requirement that has no test.
- Keep known limitations honest (no semantic search, no attachments, table-count ceiling, add/drop/index only for schema).
- Landing-page limitations must match README.

---

### Task 1: PRD

**Files:**
- Modify: `docs/prd.md`

- [ ] **Step 1: Tick P0 criteria backed by tests (R1 joins/aggregates, schema versioned reversible for add/drop/index, R2 history API, R3 already done, R4 already done, R5 MCP join, R6 GraphQL/REST/client, R7 audit query, R8 console+CLI)**
- [ ] **Step 2: Record Q1–Q4 resolutions in §8**
- [ ] **Step 3: Replace “No self-hosting in v1” with hosted product + eval preview**
- [ ] **Step 4: Note P1 still unbuilt**
- [ ] **Step 5: Commit** `docs: record P0 completions and Q1–Q4 in PRD`

---

### Task 2: System design

**Files:**
- Modify: `docs/system-design.md`

- [ ] **Step 1: GraphQL/REST exist and share the compiler**
- [ ] **Step 2: Engine queries use limit/offset; GraphQL uses connections**
- [ ] **Step 3: Document `schema_revisions`**
- [ ] **Step 4: pgvector remains P1 / unbuilt**
- [ ] **Step 5: Commit** `docs: update system design for shipped P0 APIs`

---

### Task 3: README and site

**Files:**
- Modify: `README.md`
- Modify: `apps/site/src/app/page.tsx`

- [ ] **Step 1: Remove “No GraphQL, no REST, no generated TypeScript client”**
- [ ] **Step 2: Replace create-only schema limitation with add/drop/index**
- [ ] **Step 3: Keep no search, no attachments, table-count ceiling, no production self-host**
- [ ] **Step 4: Site limitations list matches README; do not invent a Ciel production claim**
- [ ] **Step 5: Commit** `docs: align README and landing limitations`
