# KitsuneOS Console — Notion-like Workspace UI

**Date:** 2026-09-03  
**Status:** Approved for planning  
**Scope:** `apps/app` console + shared `packages/ui` (shadcn monorepo). Landing (`apps/site`) is out of scope.

## Problem

The current console is a dark amber “tool page” product: top pill nav into Schema, Query, Review, Grants, Audit, and History. That does not match how operators think about KitsuneOS data (collections of records) or how agents interact with it (propose → human approve).

We want a workspace UI closer to **Notion databases + GitBook density + GitHub PR inbox**, on a **black + orange** dark-only theme, built with **shadcn**.

## Goals

1. Sidebar navigation is **collections**, not tool routes.
2. Opening a collection shows a **customizable table view** of records.
3. **Settings** owns schema customization (and related workspace controls).
4. **Inbox / Notifications** is the change-request surface (GitHub PR analogue).
5. Shared design system via **shadcn in a monorepo layout** (`packages/ui`).
6. Visual language: near-black surfaces, orange accent, quiet chrome.

## Non-goals (this program)

- Marketing / landing redesign (`apps/site`) — deferred until product owner specifies.
- Light theme.
- Board, calendar, gallery, or list database views (table only for v1).
- Full-text search backend (P1); v1 may filter client-side on the loaded page.
- Replacing MCP / GraphQL / REST APIs — reuse existing engine surfaces.
- Mobile-first layout polish (desktop-first; sidebar may collapse later).

## Information architecture

```
┌──────────────────┬─────────────────────────────────────────────┐
│ KitsuneOS        │  {Collection name}                          │
│                  │  Table · Filters · Sort · Columns · New     │
│ Collections      ├─────────────────────────────────────────────┤
│  accounts        │  property columns…                          │
│  contacts        │  row…                                → peek │
│  opportunities   │                                             │
│                  │                                             │
│ ───────────────  │                                             │
│ Inbox (badge)    │                                             │
│ Settings         │                                             │
└──────────────────┴─────────────────────────────────────────────┘
```

### Routes (replace current console pages)

| Route | Purpose |
|-------|---------|
| `/` | Redirect to first collection, or empty-state “create collection” if none |
| `/c/[collection]` | Collection table view |
| `/inbox` | Change-request inbox |
| `/inbox/[changeSetId]` | Review detail for one change set |
| `/settings` | Schema, grants, workspace/API key |
| `/settings/schema` | Default settings landing (schema) |
| `/settings/grants` | Principals & grants |
| `/settings/workspace` | API key / workspace meta |

**Removed as top-level nav:** `/schema`, `/query`, `/review`, `/grants`, `/audit`, `/history` (and home tool-link grid). Existing API routes remain. Advanced/debug query/audit/history may return later under Settings → Advanced; not in v1 chrome.

## Visual design

### Theme (dark only)

| Token role | Direction |
|------------|-----------|
| Background | Near-black (`~#0a0a0a`) |
| Sidebar / raised | `#111`–`#171717` |
| Borders | Hairline `#262626` |
| Text | High-contrast gray/white |
| Muted text | Mid gray |
| Primary / accent | Orange (interactive: active nav, primary buttons, focus ring, unread badge) |
| Status | Map existing pending / applied / attention colors onto the new palette without warm-stone surfaces |

No light mode. No ambient gradient chrome from the current Foxfire theme on console shells.

### Typography

- UI: Outfit (or equivalent clean sans already in app)
- Code / IDs / JSON fallbacks: IBM Plex Mono
- Drop Fraunces from console chrome (brand wordmark may stay sans)

### Density

Notion/GitBook-like: compact sidebar, table row height comfortable for scanning, large page title only on collection header. Prefer rows and hairlines over card stacks.

### Motion

Subtle only: sidebar active state, sheet open/close, toast. No decorative motion on first paint.

## Feature design

### 1. App shell

- Persistent left sidebar (≈240px) using shadcn `Sidebar`.
- Top of sidebar: product name.
- Middle: scrollable collection list (icon + name); active collection highlighted with orange.
- Bottom: Inbox (with unread count badge) and Settings.
- Main: scrollable content region with consistent horizontal padding.

### 2. Collection table view (`/c/[collection]`)

**Data:** `engine.query` / existing `/api/query` (or GraphQL) with workspace from session.

**Toolbar**

- Collection title
- New record
- Filter (property + operator + value; v1 supports a small operator set matching engine filters)
- Sort
- Columns (show/hide)
- Optional local search box filtering loaded rows (not server search)

**Table**

- Columns = visible fields from schema (+ system columns if useful: id truncated)
- Row click opens record peek
- Empty and loading states use `Skeleton` / empty copy

**View customization (v1)**

- Persisted **per user + collection** in `localStorage` for filters/sorts/column visibility (no new backend table in v1). Document as client-only; server-persisted views are a later enhancement.
- Single view named “Table” — no multi-view tabs until a later phase.

### 3. Record peek

- shadcn `Sheet` (or Dialog on small widths)
- Properties listed as labeled fields (Notion property stack)
- Save triggers `directWrite` or propose path based on grants (same rules as today)
- Show clear error if forbidden / validation fails

### 4. Inbox (notifications)

- Lists open change sets (existing review APIs)
- Row: summary, principal/agent, collection, status, relative time
- Unread/open count on sidebar badge = count of open change sets awaiting review for current principal
- Detail page: field-level before/after diffs; Approve / Reject per operation; Submit decisions — behavior from current `ActionConsent` / review flow, restyled to shell

### 5. Settings

**Schema**

- List collections; select one to edit fields
- Add field / drop field / set indexed — maps to existing schema evolution APIs (`addField`, `dropField`, `setIndexed`)
- Create collection entry point (defineCollection)
- UX patterned after Notion property config (type picker, name), not a raw JSON form

**Grants**

- Table of grants + create/revoke (existing grants APIs)
- Secondary to schema; still reachable

**Workspace**

- Show workspace id; API key reveal when provisioned (existing `/api/me` behavior)

## Design system & architecture

### Monorepo shadcn

- Initialize shadcn for the monorepo with shared components living under `packages/ui` (or `packages/ui/src/components`).
- `apps/app` consumes `@kitsuneos/ui` for primitives + shell pieces.
- `cn()` utility shared from UI package.
- Tailwind v4 (or project-standard Tailwind) configured so app and UI package share tokens.
- Map Kitsune black/orange tokens into shadcn CSS variables (`--background`, `--primary`, etc.) in one place.

### App structure (target)

```
apps/app/src/
  app/
    (workspace)/layout.tsx    # shell with sidebar
    (workspace)/page.tsx      # redirect
    (workspace)/c/[collection]/page.tsx
    (workspace)/inbox/page.tsx
    (workspace)/inbox/[changeSetId]/page.tsx
    (workspace)/settings/...
  components/
    shell/...
    collection/...
    inbox/...
    settings/...
packages/ui/
  src/components/ui/          # shadcn primitives
  src/styles.css              # tokens + base
```

### Backend / API usage

No new control-plane tables required for v1 UI persistence.

| UI need | Source |
|---------|--------|
| List collections | Existing schema/collections APIs |
| Query rows | `query` / GraphQL |
| Write row | direct write / propose |
| Schema edit | schema evolution mutations |
| Grants | grants APIs |
| Inbox | review / change set APIs |

## Migration of current console

1. Add shell + new routes alongside old pages if needed during development.
2. Point `/` at collection redirect.
3. Delete or redirect old top-level tool pages once parity features live in Settings/Inbox.
4. Restyle or replace `ActionConsent` to use shadcn primitives; keep decision semantics.

## Error handling

- Unauthenticated: existing WorkOS / local-demo auth paths unchanged.
- Missing collection: 404 empty state with link back to first collection.
- Query/write failures: inline `Alert` + toast; do not wipe table state.
- Inbox submit partial failure: surface per-op errors as today.

## Testing

- Keep acceptance coverage for engine/review/grants behavior.
- Add console UI acceptance or Playwright smoke later if present in repo; minimum: API-backed flows still pass (`console.test.ts` may need route updates).
- Manual walkthrough: sidebar collections → table → peek → settings schema → inbox review.

## Phased delivery (for planning)

1. **Foundation:** shadcn monorepo, black/orange tokens, app shell sidebar.
2. **Collection table:** list/query, column visibility, filter/sort, local view state.
3. **Record peek + writes.**
4. **Inbox** list + detail (ActionConsent restyle).
5. **Settings** schema + grants + workspace; remove old nav pages.

## Open decisions (resolved)

| Topic | Decision |
|-------|----------|
| Shell | Notion-like sidebar + main |
| Implementation layout | shadcn monorepo (`packages/ui`) |
| Theme | Dark only, black + orange |
| Primary nav | Collections |
| Views v1 | Table only |
| Schema home | Settings |
| Change requests | Inbox (PR-style) |
| Landing | Out of scope for now |
| View persistence v1 | `localStorage` per user/collection |

## Success criteria

- Operator can browse records by collection without visiting tool pages.
- Operator can customize visible columns / filter / sort on a table view.
- Operator can edit schema from Settings.
- Operator can process agent proposals from Inbox like a PR queue.
- UI reads as a dark Notion-like workspace with orange accent, implemented with shadcn components (not hand-rolled BEM panels).
