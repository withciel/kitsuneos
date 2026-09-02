# GraphQL, REST, and Generated Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the engine through generated GraphQL, REST single-record GET, and a typed TypeScript client, all sharing `KitsuneEngine` with no second authorization path.

**Architecture:** Per-request GraphQL schema built from `kitsune.collections` after workspace resolution (never from the query body). Nested relation fields use DataLoader-batched `engine.query` calls. Aggregates map 1:1 to `engine.query` including `join`. REST GET wraps `readRecord`. Codegen emits types from collection definitions, not from GraphQL SDL.

**Tech Stack:** `graphql`, `graphql-yoga`, existing Next.js app, Vitest.

## Global Constraints

- Workspace from session or API key only.
- Same grant enforcement as MCP.
- GraphQL connections use cursor pagination, not offset.
- Writes still go through change sets; GraphQL/REST are read-only.
- `pnpm codegen --check` fails CI on type drift.

---

### Task 1: packages/graphql schema builder

**Files:**
- Create: `packages/graphql/package.json`, `tsconfig.json`, `src/index.ts`, `src/build-schema.ts`, `src/loaders.ts`

**Interfaces:**
```ts
buildWorkspaceSchema(engine: KitsuneEngine, ctx: { workspaceId: string; principalId: string }): Promise<GraphQLSchema>
executeGraphql(engine, ctx, source: string, variableValues?: Record<string, unknown>): Promise<ExecutionResult>
```

- [ ] **Step 1: Scaffold package depending on `@kitsuneos/core` and `graphql`**
- [ ] **Step 2: Type per collection the caller can see via `describeSchema`; skip collections with no grant**
- [ ] **Step 3: Relation fields resolve with a DataLoader keyed by target collection + id, calling `engine.query` with `filters: [{ field: 'id', op: 'in', value: ids }]`**
- [ ] **Step 4: `<collection>Aggregate(groupBy, join, aggregates)` maps to `engine.query`**
- [ ] **Step 5: Connection fields `first`/`after` sort by id (plus requested sort) and encode cursor as the last id**
- [ ] **Step 6: Acceptance `packages/acceptance/src/graphql.test.ts`** — masked agent cannot see `amount` or `accounts`; nested account uses one batched query
- [ ] **Step 7: Commit** `feat: generate GraphQL schema from collections`

---

### Task 2: HTTP GraphQL + REST

**Files:**
- Create: `apps/app/src/app/api/graphql/route.ts`
- Create: `apps/app/src/app/api/records/[collection]/[id]/route.ts`
- Modify: `apps/app/package.json` (depend on `@kitsuneos/graphql` and `@kitsuneos/server`)

**Interfaces:**
- POST `/api/graphql` — session (`requireWorkspace`) or `Authorization: Bearer` API key
- GET `/api/records/:collection/:id` — same auth; missing and forbidden both 404 with identical body `{ "error": "Not found" }`

- [ ] **Step 1: Yoga handler builds schema inside the request after resolving credentials**
- [ ] **Step 2: REST GET calls `engine.readRecord`; null → 404**
- [ ] **Step 3: Tests in `packages/acceptance/src/graphql.test.ts` covering API-key agent mask**
- [ ] **Step 4: Commit** `feat: GraphQL and REST read endpoints`

---

### Task 3: Codegen + client

**Files:**
- Create: `packages/codegen/` with `src/index.ts` reading `packages/codegen/fixtures/demo-schema.json`
- Create: `packages/client/` with `src/generated.ts` (emitted) and `src/index.ts` (fetch helpers)
- Modify: root `package.json` scripts `codegen` / `codegen --check`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
```ts
// generated
export interface Opportunity { id: string; name: string; amount?: number; ... }
export interface Account { id: string; name: string; ... }

// client
graphql<T>(query: string, variables?: object): Promise<T>
readRecord<C extends string>(collection: C, id: string): Promise<Record<string, unknown> | null>
```

- [ ] **Step 1: Fixture schema matches demo CRM collections**
- [ ] **Step 2: `pnpm codegen` writes `packages/client/src/generated.ts`**
- [ ] **Step 3: `pnpm codegen --check` exits 1 if the file would change**
- [ ] **Step 4: Test that dropping a field in the fixture fails `--check`**
- [ ] **Step 5: Commit** `feat: collection-derived TypeScript client`
