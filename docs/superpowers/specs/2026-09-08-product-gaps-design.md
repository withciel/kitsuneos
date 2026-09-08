# S3 — Remaining Product Gaps UX

**Date:** 2026-09-08  
**Status:** Wave 1 design (ready for user review → Wave 2 plan)  
**Parent:** `2026-09-08-ui-program-charter-design.md`  
**Sources:** `docs/gap-analysis-product-replacement.md`, `docs/gap-analysis-notion-parity.md`, live Connect/Share/onboarding code  
**Mode:** Operate (product surfaces); honesty-first copy

---

## 1. Problem

Notion-parity UI for core workspace loops is largely shipped. Remaining gaps are uneven: some need greenfield UI (vault import/export, OAuth consent), some need copy/honesty fixes (Connect MCP), some need engine completion with light UX polish (compiler page ACL). Without a single spec, implementers either overbuild chrome or leave Connect overclaiming.

---

## 2. DNA constraints (non-negotiable)

From PRD / system design — S3 must not violate:

- Field-level change ops + change sets for agent writes (`propose` recommended default)  
- Single authorization path through the query compiler  
- No second ad-hoc authz filter as the long-term model (post-filter only as temporary backstop)  
- Agents as first-class principals  
- Empty provision (no CRM auto-seed); optional templates OK  

Visual tokens defer to S2. Do not invent a parallel Settings aesthetic.

---

## 3. Gap catalog

### Gap A — Connect AI honesty (MCP Streamable HTTP)

**Status:** Partial (gap #10)  
**Priority in S3 sequence:** 1 (unblocks trust for activation)

**Current UX**
- `/settings/connect` claims real MCP over stdio + remote Streamable HTTP  
- Guides for Cursor remote (`{origin}/api/mcp`), Claude connector, local stdio, legacy REST  
- Copy references OAuth “consent” / “Approve access when prompted”

**Reality**
- Streamable HTTP + well-known OAuth AS/PRM exist  
- `/api/mcp/oauth/authorize` auto-issues code after WorkOS login — **no approve/deny UI**  
- Login alone is consent today  

**Key files**
- `apps/app/src/app/(workspace)/settings/connect/page.tsx`  
- `apps/app/src/app/api/mcp/oauth/authorize/route.ts`  
- `packages/server/src/streamable-mcp.ts`  
- Plan intent: `docs/superpowers/plans/2026-09-06-mcp-stdio-and-remote-oauth.md`

**Design**
1. Truth table in Connect UI (per client): transport, auth method, what the human sees, what is auto-approved.  
2. Until Gap B ships, copy must say access is granted on sign-in (not a separate consent prompt).  
3. Keep “Legacy REST ≠ MCP” framing.  
4. Do not claim marketplace/Directory readiness.  
5. Show connected MCP OAuth clients + revoke when Gap B lands; until then, document CLI/key revocation paths honestly.

**Success:** A careful reader cannot be surprised by missing consent UI.

---

### Gap B — OAuth authorization-code consent UI

**Status:** Deferred (gap #11)  
**Priority:** 2  
**Depends on:** Gap A copy freeze so we do not oscillate messaging

**Two stacks (keep separate in UI)**

| Stack | Grant | Today | Target |
|-------|-------|-------|--------|
| MCP remote | auth code + PKCE | Auto-approve after login | Explicit consent screen |
| Kitsune-as-DB apps | client_credentials | Connect OAuth apps panel | Unchanged panel; clearly labeled |

**Consent screen requirements**
- Client name (from registration)  
- Workspace (if multi-membership)  
- Acting principal context (signed-in human; agent binding rules explicit)  
- Scope summary (`mcp:tools` or listed tools class)  
- Approve / Deny  
- Audit-friendly outcome (who approved what, when)

**Key files**
- Authorize route above; `apps/app/src/lib/mcp-oauth.ts`  
- Apps panel: `apps/app/src/components/settings/oauth-apps-panel.tsx`  
- Spec sketch already in MCP plan §3.1 — this gap **implements** that screen

**Engine dependency:** Existing `mcp_oauth_*` tables and token → `{ workspaceId, principalId }` into grant path. No second auth system.

**Success:** Remote MCP connect shows a real Approve/Deny; Deny issues no code; Connect copy matches.

---

### Gap C — Markdown vault import/export

**Status:** Pending (gap #9)  
**Priority:** 3  
**Depends on:** None for CLI; UI depends on progress + change-set links

**Current UX:** None in Settings/Connect. CLI `ingest` / `export`; MCP `ingest` expects pre-parsed records.

**Key files**
- `packages/cli/src/ingest.ts`, `export.ts`  
- `packages/core/src/engine.ts` (`ingest`)  
- MCP schema note in `packages/mcp/src/schemas.ts`

**Design — Connect or Settings “Vault” panel**
1. **Import:** target collection (default personal `notes` or picker), source (zip/folder when browser-capable; otherwise documented CLI), field map defaults, write mode `propose` (default) vs `direct` (admin), progress, link to resulting change set(s).  
2. **Export:** Obsidian-friendly `.md` tree respecting page ACL (not only JSON CLI dump).  
3. Errors: partial failure list; never claim success if change sets still open pending review.  
4. Honest fallback: “Prefer CLI for large vaults” with copy-paste commands.

**Out of scope:** Local-first sync, FUSE, realtime vault watchers.

**Success:** Operator can import a small markdown zip into `notes` via UI and find pages; export download respects private pages.

---

### Gap D — Compiler page ACL UX

**Status:** Share UI shipped; compiler leftovers (gap #1)  
**Priority:** 4 (engine-led; UX is polish)

**Current UX**
- Share dialog on page: Private / Workspace / Shared; people/teams/agents with `read` | `write` | `full`  
- `page_access` / `page_shares` enforced in query compiler for list/get paths  
- Remaining `TODO(compiler-acl)`: related neighbors in engine, graph route, search edge cases (post-filter)

**Key files**
- `apps/app/src/components/page/share-dialog.tsx`  
- `packages/core/src/compiler/page-access-sql.ts`  
- TODOs in `packages/core/src/engine.ts`, `apps/app/src/app/api/graph/route.ts`, `apps/app/src/app/api/search/route.ts`

**Design**
1. Do **not** redesign Share model.  
2. UX polish: clearer intersection copy (“Collection grants ∩ page access”), capability plain language, empty “who has access”.  
3. Spec requirement for engine: graph/search/related must not materialize private rows before filter (privacy + DNA).  
4. Optional: Share dialog note when a principal lacks collection grant (would still not-found).

**Success:** Share remains understandable; engine TODOs closed without a second authz path; UI copy matches not-found-not-forbidden behavior.

---

### Gap E — Onboarding activation polish (bridge with S1)

**Status:** Shipped (gap #13); polish only  
**Priority:** Parallel with Gap A

**Current**
- Empty provision; home empty CTAs; `SetupChecklist` four steps; Connect labeled step 3  

**Design**
1. Align site **Start free** promise with home empty copy (S1).  
2. Stronger “agent connected” signal than “agent row exists” (successful MCP/OAuth or recent tool call) — may be heuristic v1 with honest labeling.  
3. Optional templates in empty state (PRD-allowed); never CRM auto-seed.  
4. Checklist visual weight follows S2 operate helpers.

**Success:** First-run path feels like one product across site → empty home → Connect.

---

## 4. Sequencing inside S3

```
A Connect honesty  →  B Consent UI  →  C Vault UI
                 ↘
                   E Onboarding copy (parallel with A)
D Compiler ACL     (engine track; UX polish when ready)
```

Wave 2 may produce one plan with phased PRs or four plan files; prefer phased PRs under one plan titled `2026-09-08-product-gaps.md` unless size forces a split at B/C.

---

## 5. Non-goals

- Local-first Obsidian sync  
- Full OAuth marketplace packaging  
- Public anonymous CDN  
- Replacing client_credentials apps panel with auth-code for server apps  
- Packaging sold CRM  

---

## 6. Testing (Wave 3)

| Gap | Proof |
|-----|-------|
| A | Connect copy review checklist; no “approve when prompted” without UI |
| B | Deny blocks token; Approve yields working MCP session |
| C | Small zip import → pages visible; private page absent from export |
| D | Graph/search cannot observe private neighbor via timing/content |
| E | New signup lands on empty home with coherent CTAs |

---

## 7. Success

Each gap names problem, UX, engine dependency, and done-when. Implementers know UI-only vs blocked-on-compiler work, and Connect cannot overclaim consent.
