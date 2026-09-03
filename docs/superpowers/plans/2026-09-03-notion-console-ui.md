# Notion Console UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tool-page console with a Notion-like workspace: collection sidebar, table views, settings (schema), and PR-style inbox — dark black + orange, shadcn.

**Architecture:** App Router route group `(workspace)` with shared sidebar shell. shadcn primitives under `apps/app/src/components/ui` (consumed by console); shared tokens in `globals.css`. Existing `/api/*` routes power data. View prefs in `localStorage`.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS v4, shadcn/ui (Radix), Lucide, existing KitsuneEngine APIs.

## Global Constraints

- Dark only; near-black background; orange primary accent
- Table views only (no board/list)
- Landing (`apps/site`) untouched
- Reuse existing API routes; no new control-plane tables for view prefs
- Branch: `cursor/notion-console-design-b97e` (or continue feature work on same / new build branch)

## File map

| Path | Responsibility |
|------|----------------|
| `apps/app/components.json` | shadcn config |
| `apps/app/src/app/globals.css` | Tailwind + black/orange tokens |
| `apps/app/src/components/ui/*` | shadcn primitives |
| `apps/app/src/components/shell/app-sidebar.tsx` | Collection list + Inbox + Settings |
| `apps/app/src/components/shell/workspace-shell.tsx` | SidebarProvider layout |
| `apps/app/src/app/(workspace)/layout.tsx` | Shell wrapper |
| `apps/app/src/app/(workspace)/page.tsx` | Redirect to first collection |
| `apps/app/src/app/(workspace)/c/[collection]/page.tsx` | Table view |
| `apps/app/src/components/collection/*` | Table, toolbar, peek sheet, view state |
| `apps/app/src/app/(workspace)/inbox/**` | Inbox list + detail |
| `apps/app/src/app/(workspace)/settings/**` | Schema / grants / workspace |
| Remove/redirect | Old `/schema` `/query` `/review` `/grants` `/audit` `/history` pages |

---

### Task 1: Foundation — Tailwind + shadcn + tokens + shell

**Files:** Create/modify under `apps/app/` as above for init, globals, sidebar, layout.

- [ ] Init Tailwind + shadcn in `apps/app` (`npx shadcn@latest init -d --base radix`)
- [ ] Add components: `button`, `input`, `textarea`, `table`, `badge`, `separator`, `dropdown-menu`, `sheet`, `dialog`, `select`, `label`, `scroll-area`, `skeleton`, `tooltip`, `sidebar`, `alert`
- [ ] Set CSS variables to black + orange dark theme
- [ ] Build `(workspace)/layout.tsx` with sidebar shell fetching collections from `/api/schema`
- [ ] Redirect `/` into workspace group; stub empty main
- [ ] Commit

### Task 2: Collection table view

- [ ] `/c/[collection]` page: query via POST `/api/query`, render shadcn Table
- [ ] Toolbar: New, Filter, Sort, Columns, local search
- [ ] Persist column visibility / sort / filter in `localStorage` key `kitsune:view:{collection}`
- [ ] Commit

### Task 3: Record peek + writes

- [ ] Sheet with property fields; PATCH/POST via `/api/records/...` or existing write path
- [ ] New record flow
- [ ] Commit

### Task 4: Inbox

- [ ] `/inbox` list from GET `/api/review`
- [ ] `/inbox/[id]` detail with ActionConsent-equivalent approve/reject UI using shadcn
- [ ] Sidebar badge = open count
- [ ] Commit

### Task 5: Settings + retire old pages

- [ ] Settings schema / grants / workspace pages using existing APIs
- [ ] Redirect old tool routes to new homes
- [ ] Update acceptance console tests if needed
- [ ] Manual smoke + commit

---

## Execution

Proceeding with **inline execution** (user asked to build).
