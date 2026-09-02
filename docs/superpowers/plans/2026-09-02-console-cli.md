# Console and CLI P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1 human surfaces: schema browser, query runner, field-level review with partial approval, grant editor, audit search, history view, and CLI commands `init`, `schema push`, `schema diff`, `query`, `changesets`, `export`.

**Architecture:** Console pages in `apps/app` call session-authenticated API routes that wrap `KitsuneEngine` (and GraphQL for the query runner). CLI talks to the engine with `KITSUNE_WORKSPACE_ID` / `KITSUNE_PRINCIPAL_ID` (demo ids remain the default). ActionConsent renders before/after diffs and per-operation decisions.

**Tech Stack:** Next.js 15, existing `@kitsuneos/ui`, CLI on tsx.

## Global Constraints

- Workspace never from query string, body, or MCP args.
- Reviewer reads current values through `readRecord` (same grants as any read).
- Do not auto-apply on Approve unless every operation in the set was approved.
- Export is grant-filtered for non-admins.

---

### Task 1: ActionConsent diffs + per-op review

**Files:**
- Modify: `packages/ui/src/ActionConsent.tsx`
- Modify: `packages/ui/src/styles.css`
- Modify: `apps/app/src/app/review/page.tsx`
- Modify: `apps/app/src/app/api/review/route.ts`

- [ ] **Step 1: Render `- before` / `+ after` for each operation**
- [ ] **Step 2: GET /api/review includes `before` from `readRecord` as the reviewer**
- [ ] **Step 3: POST accepts `{ changeSetId, decisions: ReviewDecision[] }` and optional `{ apply: true }` only when no ops remain `proposed`**
- [ ] **Step 4: Page no longer auto-applies after a blanket approve if the user is deciding per-op**
- [ ] **Step 5: Commit** `feat: field-level review diffs and partial approval`

---

### Task 2: Console pages

**Files:**
- Create: `apps/app/src/app/schema/page.tsx` + `apps/app/src/app/api/schema/route.ts` (`describeSchema`)
- Create: `apps/app/src/app/query/page.tsx` + `apps/app/src/app/api/query/route.ts` (`engine.query` JSON)
- Create: `apps/app/src/app/grants/page.tsx` + `apps/app/src/app/api/grants/route.ts` (`createGrant`/`revokeGrant`/`listGrants`)
- Create: `apps/app/src/app/audit/page.tsx` + `apps/app/src/app/api/audit/route.ts` (`queryAudit`)
- Create: `apps/app/src/app/history/page.tsx` + `apps/app/src/app/api/history/route.ts` (`listRecordRevisions`)
- Modify: `apps/app/src/app/home-content.tsx` nav links
- Modify: `packages/core/src/engine.ts` add `listGrants` if missing

- [ ] **Step 1: Each route uses `requireWorkspace()` only**
- [ ] **Step 2: HTTP tests or route-handler tests for auth failure and grant masking**
- [ ] **Step 3: Commit** `feat: console schema, query, grants, audit, history`

---

### Task 3: CLI commands

**Files:**
- Create: `packages/cli/src/init.ts`, `schema.ts`, `query.ts`, `export.ts`, `workspace.ts`
- Modify: `packages/cli/src/index.ts`, `review.ts`, `history.ts`

**Commands:**
```
kitsuneos init
kitsuneos schema diff
kitsuneos schema push
kitsuneos query --collection NAME [--json '{...}']
kitsuneos changesets
kitsuneos export
```

- [ ] **Step 1: `workspace.ts` reads `KITSUNE_WORKSPACE_ID` / `KITSUNE_PRINCIPAL_ID`, defaulting to demo ids**
- [ ] **Step 2: `init` writes `kitsune.schema.json` stub + `.env.example`**
- [ ] **Step 3: `schema diff` / `push` compare file to live collections and call `defineCollection` / `previewSchemaChange` / `applySchemaChange`**
- [ ] **Step 4: `query` prints JSON from `engine.query`**
- [ ] **Step 5: `changesets` aliases review list**
- [ ] **Step 6: `export` dumps schema + rows; non-admin is grant-filtered**
- [ ] **Step 7: Point `review`/`history` at `workspace.ts` instead of hardcoded DEMO-only (demo remains default)**
- [ ] **Step 8: Commit** `feat: CLI init, schema, query, changesets, export`
