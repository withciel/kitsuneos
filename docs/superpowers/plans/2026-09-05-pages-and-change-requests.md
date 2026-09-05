# Pages + Change Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make KitsuneOS feel like Notion pages + GitHub PRs: every entity opens as a full page; change requests review multi-page (multi-collection) diffs as one PR — without rewriting the relational engine.

**Architecture:** Keep records/collections/change sets in `@kitsuneos/core`. Add a first-class `/p/[pageId]` console surface, demote the record Sheet peek to secondary, and regroup Inbox detail by page. Product language shifts to page / database / change request. Spec: `docs/superpowers/specs/2026-09-05-pages-and-change-requests-design.md`.

**Tech Stack:** Next.js App Router (`apps/app`), existing `/api/records`, `/api/review`, `/api/schema`, `@kitsuneos/core` change-set engine, current shadcn UI.

## Global Constraints

- **No storage inversion** — do not reopen ADR-001 toward document-first object storage
- **No new control-plane tables** for P1–P2 unless absolutely required (prefer conventions)
- **Agents stay at `propose`** by default (PRD Q1); humans with write/admin may direct-write from the page
- **Change-set op granularity unchanged** — reviewable unit = op; atomic unit = change set
- **Dark black + orange** console visual language unchanged
- **Table remains the only database view** (no board/calendar)
- **Landing (`apps/site`) out of scope** unless a one-line positioning tweak is explicitly requested
- Prefer small PRs per phase; do not mix P3 polish into P1
- Branch naming for implementation: `cursor/pages-change-requests-pN-b97e` (N = phase)

## File map (expected touch set)

| Path | Responsibility |
|------|----------------|
| `docs/superpowers/specs/2026-09-05-pages-and-change-requests-design.md` | Product design (already on branch / main) |
| `docs/superpowers/plans/2026-09-05-pages-and-change-requests.md` | This plan |
| `docs/system-design.md` | ADR-001 presentation amendment note |
| `docs/prd.md` | Short pointer / UX story updates |
| `docs/superpowers/specs/2026-09-03-notion-console-ui-design.md` | Status: partially superseded |
| `apps/app/src/app/(workspace)/p/[pageId]/page.tsx` | Full page route (new) |
| `apps/app/src/components/page/*` | Page shell, title, body, property rail (new) |
| `apps/app/src/components/collection/collection-view.tsx` | Row → `/p/...`; peek optional |
| `apps/app/src/app/(workspace)/inbox/**` | PR copy + page-grouped diffs |
| `apps/app/src/lib/record-label.ts` | Reuse for page titles |
| `apps/app/src/lib/page.ts` | Helpers: resolve collection+id, pick body field (new) |
| API routes under `apps/app/src/app/api/**` | Reuse; only extend if page bootstrap needs a single round-trip |

---

### Task 0: Docs alignment on main (this PR)

**Files:**
- Create: `docs/superpowers/specs/2026-09-05-pages-and-change-requests-design.md`
- Create: `docs/superpowers/plans/2026-09-05-pages-and-change-requests.md`
- Modify: `docs/system-design.md` (ADR-001 presentation note)
- Modify: `docs/prd.md` (pointer + human stories)
- Modify: `docs/superpowers/specs/2026-09-03-notion-console-ui-design.md` (supersession blurb)

- [x] Write design spec
- [x] Write this implementation plan
- [x] Amend ADR-001 with “UX presents records as pages; storage unchanged”
- [x] Update PRD human stories / console description to page + change-request language
- [x] Mark Notion console spec: peek-primary superseded by pages design
- [ ] Open PR, merge to `main`

---

### Task 1: Page helpers + `/p/[pageId]` read path (P1)

**Files:**
- Create: `apps/app/src/lib/page.ts`
- Create: `apps/app/src/components/page/page-view.tsx` (or split title/body/properties)
- Create: `apps/app/src/app/(workspace)/p/[pageId]/page.tsx`
- Modify: `apps/app/src/lib/record-label.ts` only if needed
- Test: manual + existing acceptance; add a focused unit test for body-field picker if pure helper

**Interfaces:**
- Consumes: `GET /api/records/[collection]/[id]` (or list+get patterns already used by peek), `GET /api/schema`, `GET /api/related/...` if present
- Produces: `resolvePage(pageId)` → `{ collection, recordId }` (v1: pageId === record UUID; collection from query `?c=` **or** lookup — prefer passing `?c=` from table links to avoid ambiguous UUID scan); `pickBodyField(fields)`; `pickTitleField(fields)`

**Decision for v1 URLs:** `/p/[pageId]?c=[collection]` to avoid a workspace-wide UUID search. Table and relations always supply `c`. Optional follow-up: redirector API that resolves collection.

- [ ] **Step 1:** Add `pickBodyField` / `pickTitleField` helpers with unit tests (first prose field named `body`, else first `prose`; title via existing label prefs)
- [ ] **Step 2:** Build read-only `PageView` — title, property list, body markdown/plaintext, link back to `/c/[collection]`
- [ ] **Step 3:** Wire `/p/[pageId]` page under `(workspace)` layout
- [ ] **Step 4:** Commit

---

### Task 2: Page writes + demote peek (P1)

**Files:**
- Modify: `apps/app/src/components/page/page-view.tsx`
- Modify: `apps/app/src/components/collection/collection-view.tsx`
- Reuse: existing record PATCH/POST / change-set auto-apply paths the peek uses today

- [ ] **Step 1:** Port peek field editors onto the page property rail + body editor (same API calls as Sheet)
- [ ] **Step 2:** Table row primary click → `router.push(/p/[id]?c=...)`; keep “Quick edit” that opens Sheet only from an explicit control (or remove Sheet if redundant)
- [ ] **Step 3:** New page/create flow: either stay as table “New” → create then navigate to `/p/...`, or create on page route — pick one and document in commit
- [ ] **Step 4:** Replace user-visible “Record” strings in collection + page surfaces with “Page”
- [ ] **Step 5:** Run `pnpm lint` / typecheck / relevant tests; commit

---

### Task 3: Inbox as PR list copy (P2a)

**Files:**
- Modify: `apps/app/src/app/(workspace)/inbox/page.tsx`
- Modify: sidebar labels if they say “change set”
- Modify: `apps/app/src/components/shell/*` as needed

- [ ] **Step 1:** Rename empty states / headings to **Change requests** (keep API field names)
- [ ] **Step 2:** List row subtitle: `N pages across M databases` (derive unique recordIds + collections from ops payload already fetched)
- [ ] **Step 3:** Commit

---

### Task 4: Inbox detail — page-grouped diffs (P2b)

**Files:**
- Modify: `apps/app/src/app/(workspace)/inbox/[changeSetId]/page.tsx`
- Create: `apps/app/src/components/inbox/change-request-diff.tsx` (suggested)
- Create: `apps/app/src/lib/group-ops-by-page.ts` + unit test

**Interfaces:**
- Consumes: existing review API ops (`collection`, `recordId`, `field`, old/new, status)
- Produces: `groupOpsByPage(ops) → Array<{ collection, recordId, title?, ops: Op[] }>`

- [ ] **Step 1:** Write failing unit test for `groupOpsByPage` (multi-collection fixture)
- [ ] **Step 2:** Implement helper; render PR-style file list + per-page hunks
- [ ] **Step 3:** Each page header links to `/p/[recordId]?c=[collection]`
- [ ] **Step 4:** Keep per-op approve/reject controls; group visually under pages
- [ ] **Step 5:** Apply/Merge button copy; run tests; commit

---

### Task 5: Pending change-request indicator on pages (P3 start)

**Files:**
- Modify: page view + optional lightweight API
- Modify: inbox only if needed

- [ ] **Step 1:** Given page id, find open change sets that include ops for that record (reuse list endpoint + filter client-side first)
- [ ] **Step 2:** Banner: “N open change requests touch this page” with links
- [ ] **Step 3:** Commit

---

### Task 6: Docs + acceptance polish

**Files:**
- Modify: `docs/prd.md` checklist if new stories ship
- Modify: acceptance tests only if behavior is contract-level
- Modify: `AGENTS.md` only if agent-facing nouns change in MCP descriptions (optional; don’t rename MCP tools)

- [ ] **Step 1:** Update PRD human stories 1–4 to page wording if not done in Task 0
- [ ] **Step 2:** Smoke: multi-collection change set displays two pages in Inbox detail
- [ ] **Step 3:** Ensure CI `verify` green; open implementation PR(s); merge

---

## Verification checklist (every implementation PR)

- [ ] `pnpm lint` (Biome) clean for errors
- [ ] Typecheck for touched packages
- [ ] Manual: table → full page → edit property → edit body
- [ ] Manual: agent-style multi-collection change set → Inbox shows page groups
- [ ] No ADR-001 storage regress; no new “document filesystem” path

## Out of scope reminders

- Schema changes via change requests (PRD Q5)
- Nested page trees / slash-page wiki
- Collaborative presence / CRDT body editing
- MCP tool renames (`propose_change_set` stays)

---

## Suggested implementation PR sequence

1. **Docs only** (Task 0) — this PR  
2. **P1 pages** (Tasks 1–2)  
3. **P2 change-request UX** (Tasks 3–4)  
4. **P3 indicators** (Task 5+)  

Handoff agents should start at **Task 1** unless Task 0 is not yet on `main`.
