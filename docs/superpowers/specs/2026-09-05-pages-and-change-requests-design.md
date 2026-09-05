# Pages + Change Requests — Product Design

**Date:** 2026-09-05  
**Status:** Approved for planning (docs landed; implementation not started)  
**Companion plan:** `docs/superpowers/plans/2026-09-05-pages-and-change-requests.md`  
**Supersedes (UX only):** parts of `docs/superpowers/specs/2026-09-03-notion-console-ui-design.md` (record peek as primary surface)  
**Amends:** ADR-001 presentation — storage stays relational; human/agent UX treats each entity as a **page**

---

## 1. Problem

The console shipped as **Notion databases + GitHub PR inbox**: sidebar collections, table views, record peek sheets, Inbox for change sets. That is closer to Airtable/CRM than to Notion’s real ontology.

In Notion, a database row is not “an item” — it is a **page** (title, body, properties) that happens to live in a database. Opening it is a full page experience. Multi-object edits feel like documents changing together.

KitsuneOS already has the right write model for agents (field-level change sets spanning many records/collections, atomic apply). What’s missing is the **page** mental model on top of records, and a **PR-shaped** review UX that groups those ops by page instead of presenting a flat field patch list.

---

## 2. Goals

1. **Page is the noun.** Humans never need to say “record” in primary UI copy. Every openable entity is a page.
2. **Collections are databases of pages**, not the identity of the thing. Table is a view; the page is the truth.
3. **Open always means a full page** (`/p/[pageId]`): title, body (prose), property rail, relations, history entry points.
4. **Change request = PR across pages.** One proposal can touch many pages across many collections; review shows page-grouped diffs; apply remains one atomic change set.
5. **Keep the engine.** No rewrite of relational storage, grants, field-level ops, or ADR-001’s query quality. This is a product/UX inversion, not a storage inversion.

## 3. Non-goals (this program)

- Board / calendar / gallery database views (table remains the collection view).
- Nested page trees / workspace wiki IA as a primary nav (may come later; not required to ship page-primary UX).
- Making every human keystroke go through Inbox (G6 stands: humans with `write`/`admin` may direct-write; agents stay at `propose` by default).
- Schema-as-change-set (still open Q5) — out of scope unless unblocked separately.
- Replacing MCP/GraphQL/REST contracts — add presentation affordances; keep `collection` + `recordId` in APIs unless a thin alias is clearly worth it.
- Marketing site redesign.

---

## 4. Ontology

| Product term (UI) | Engine term (keep) | Meaning |
|---|---|---|
| **Page** | Record (row in a collection table) | Addressable unit you open and live in |
| **Database / collection** | Collection | Shared property schema over a set of pages |
| **Property** | Field (non-prose) | Typed metadata on a page |
| **Body** | Prose field (convention: prefer `body` or existing primary prose field) | Long-form page content |
| **Title** | Preferred label field (`title` / `name` / … via existing `recordLabel`) | Page heading |
| **Change request** | Change set | Proposed multi-page PR; atomic apply unit |
| **Hunk / op** | Change op (field-level) | Reviewable unit inside a change request |

**Principle:** Documents are not a special case bolted onto rows in the *product* sense. Rows are how we store pages. ADR-001 remains true for Postgres; this ADR governs naming and UX.

### Standalone pages (phase boundary)

v1 of this program: every page still belongs to a collection (typed database). “Wiki pages with no collection” is a later profile (empty schema collection or dedicated `pages` collection), not a blocker for full-page UX.

---

## 5. Information architecture

```
┌──────────────────┬──────────────────────────────────────────────┐
│ KitsuneOS        │  Page title                                  │
│                  │  ─────────────────────────────────────────── │
│ Databases        │  [ properties rail ]     [ body / prose ]    │
│  accounts        │                          [ relations ]       │
│  contacts        │                                              │
│  opportunities   │                                              │
│                  ├──────────────────────────────────────────────┤
│ ───────────────  │  /c/[collection] = database table of pages   │
│ Inbox (PRs)      │  /p/[pageId]     = full page                  │
│ Settings         │  /inbox/[id]     = change request (PR)       │
└──────────────────┴──────────────────────────────────────────────┘
```

### Routes

| Route | Purpose |
|---|---|
| `/` | Redirect to first collection (unchanged) |
| `/c/[collection]` | Database table of pages; row click → page (not peek-as-primary) |
| `/p/[pageId]` | **New.** Full page: title, body, properties, relations, “Open in database” |
| `/inbox` | Open change requests (PR list) |
| `/inbox/[changeSetId]` | PR detail: rationale, pages touched, grouped diffs, approve/reject/apply |
| `/settings/*` | Schema, grants, workspace (unchanged ownership) |

Peek/sheet may remain as a **quick edit** affordance from the table; it must not be the only way to open a page. Default row activation = navigate to `/p/...`.

### Copy rules

- Prefer **page**, **database**, **change request**, **property**, **body**.
- Avoid leading with **record**, **collection** (ok in Settings/schema and API docs), **change set** (ok in engine/API; UI says change request).
- Inbox empty state and PR titles should read like GitHub, not like a CRM approval queue.

---

## 6. Page surface

Minimum viable full page:

1. **Title** — editable; maps to label field.
2. **Property rail** — typed fields except primary prose; relation fields link to other pages.
3. **Body** — primary prose field rendered as a document surface (markdown textarea v1; richer editor later).
4. **Backlink / relations** — reuse related-graph neighbors; present as linked pages.
5. **Presence of review** — if the page has pending ops in open change requests, show a quiet indicator + link to those PRs.

Writes:

- Human `write`/`admin`: direct write or auto-applied change set (existing behavior), but from the page surface.
- Agent: still `propose_change_set` only (Q1).

---

## 7. Change request = PR across pages

### Already true in the engine (do not rebuild)

- Ops are field-level; each op names a collection + record.
- One change set spans many records and collections.
- Apply is one transaction; partial approve/reject per op; base-revision conflicts.

### UX requirements

1. **PR header:** title, author principal, rationale, status, collections badge → **pages touched** summary.
2. **File-tree analogue:** list of pages in the change request (collection · page title · op count).
3. **Diffs grouped by page**, then by property/body — not a flat chronological op list as the primary view.
4. **Review actions** stay per-op (engine Q2) but the reviewer thinks in pages/hunks.
5. **Merge** language: Apply / Merge for the atomic set once reviewable ops are decided.

Multi-collection example the UI must make obvious:

> “Close Acme deal” — updates `opportunities/…` stage + amount, and `accounts/…` status, in one change request.

---

## 8. Relationship to ADR-001

| ADR-001 (keep) | This design (add) |
|---|---|
| Storage = typed rows + optional prose column | UX = pages with properties + body |
| Documents are a special case of records *in storage* | Records present as pages *in product* |
| Field-level merge semantics | Page-grouped PR review chrome |
| Query/aggregates win | Unchanged |

**Do not** migrate to document-first object storage. **Do** stop teaching humans that prose is a weird column on a CRM row.

---

## 9. Success criteria

- Operator can open any table row into a full page URL they can bookmark/share.
- A multi-collection agent change request shows ≥2 pages in the PR file list with grouped diffs.
- Primary UI copy on `/c/*`, `/p/*`, `/inbox*` uses page/change-request language.
- No engine schema migration required for the first ship slice (convention + UI + copy).
- Acceptance / lint / typecheck remain green; existing change-set API tests still pass.

---

## 10. Phased delivery (see plan)

| Phase | Outcome |
|---|---|
| **P0 — Docs + copy** | Spec/plan on main; ADR note; console copy shifts where cheap |
| **P1 — Full page route** | `/p/[pageId]`; table navigates here; peek demoted |
| **P2 — PR inbox** | Page-grouped change request detail; multi-page summary |
| **P3 — Polish** | Body-first layout, pending-PR indicators on pages, deeper Notion density |

---

## 11. Open questions (do not block P1–P2)

1. Canonical prose field name: require `body`, or auto-pick first `prose` field?
2. Page IDs in URLs: raw record UUID vs opaque `page_` prefix (engine id stays UUID either way)?
3. Should human edits on a page optionally “bundle into a draft change request” later (Notion+Git hybrid)? Default: no for v1.
4. Standalone uncollected pages — dedicated collection vs true null-collection?
