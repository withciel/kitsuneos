# S2 — Console Operator Craft and Motion

**Date:** 2026-09-08  
**Status:** Wave 1 design (ready for user review → Wave 2 plan)  
**Parent:** `2026-09-08-ui-program-charter-design.md`  
**Surface:** `apps/app` (+ thin `packages/ui`)  
**Mode:** Operate  
**Baseline note:** 2026-09-08 main shipped `ShellHeader`, `OperateEmptyState`, `LoadingBlock`, `PageHeader`, `UnderlineTabs`, and `operate-enter` utilities. Treat these as the craft foundation to extend, not revert.

---

## 1. Problem

The console IA matches the Notion-like workspace direction. Tokens (near-black + orange, Outfit, IBM Plex Mono) are coherent. Remaining craft debt is consistency (settings loading, sidebar fetch, error chrome) and motion accessibility: shadcn/`tw-animate` zoom overlays, continuous d3 graph ticks, and new `operate-enter` animations ship **without** `prefers-reduced-motion` gates.

---

## 2. Scope

**In**
- Workspace shell, lists, page, Changes, Agents, Graph, Settings, ⌘K, dialogs/sheets/tooltips  
- `apps/app/src/app/globals.css` operate motion utilities  
- Animation recon + prioritized fixes  

**Out**
- Marketing site (S1)  
- New engine features (S3)  
- Framer Motion by default  
- Route-transition theater, confetti, badge bounce, table row stagger  

---

## 3. Operator-craft audit

### 3.1 IA (keep)

Sidebar: workspace/personal DBs, Changes, Agents, Graph, Settings.  
Routes: `/`, `/c/[collection]`, `/p/[pageId]`, `/changes`, `/agents`, `/graph`, `/settings/*`.  
Aliases: `/inbox` → Changes.  

### 3.2 Tokens (lock)

| Token | Value |
|-------|--------|
| Background | `#0a0a0a` |
| Card | `#111111` |
| Primary | `#f54e00` |
| Border | `#262626` |
| Radius | `--radius: 0.5rem` |
| Sans / mono | Outfit / IBM Plex Mono |
| Icons | Lucide (project standard — allowed) |

### 3.3 Craft findings

| ID | Severity | Finding | Direction |
|----|----------|---------|-----------|
| C1 | MEDIUM | Padding drift (`p-8` vs `px-6`) across home vs lists | Standardize on shell content padding via operate helpers |
| C2 | MEDIUM | Settings pages remount nav; loading states inconsistent | Prefer shared settings layout pattern; reuse `LoadingBlock` |
| C3 | MEDIUM | Sidebar schema fetch has no skeleton | Use `SidebarMenuSkeleton` or quiet placeholders |
| C4 | MEDIUM | Error chrome inconsistent (plain text vs bordered) | One destructive alert pattern |
| C5 | LOW | Checklist can feel marketing-dense under header | Keep function; visual weight quieter (already partially refined) |
| C6 | KEEP | `ShellHeader` breadcrumbs + ⌘K affordance | Extend; do not replace with static “Workspace” label |
| C7 | KEEP | `OperateEmptyState` — no dashed boxes | Adopt everywhere empty states still hand-roll chrome |

---

## 4. Motion recon

### 4.1 Inventory

| Surface | Mechanism | Frequency |
|---------|-----------|-----------|
| ⌘K / Dialog | fade + `zoom-in-95`, ~100ms | High (palette) / Occasional (modals) |
| Sheet | slide + 200ms ease-in-out | Occasional |
| Tooltip | zoom-in-95 | Tens/day |
| Skeleton | `animate-pulse` | Continuous while loading |
| Sidebar width | 200ms ease-linear | Occasional |
| `operate-enter` | 280ms translateY+fade | Every major view mount |
| `operate-enter-fast` | 160ms fade | Header crumbs |
| Graph | continuous d3-force | While on `/graph` |

**Absent today:** `prefers-reduced-motion` / `motion-reduce` anywhere under `apps/app`.

### 4.2 Findings table

| # | Severity | Location | Finding | Fix summary |
|---|----------|----------|---------|-------------|
| M1 | HIGH | App-wide | No reduced-motion handling | Global CSS: disable `operate-enter*` transforms; `motion-reduce:animate-none` on pulse; gate tw-animate zoom/slide |
| M2 | HIGH | `components/ui/dialog.tsx` + command palette | Zoom on high-frequency palette | Fade-only for cmdk; keep subtle zoom optional for rare confirm dialogs |
| M3 | HIGH | `components/graph/force-graph.tsx` | Continuous sim, no reduced-motion / visibility pause | Static or one-shot settle when reduced; pause when tab hidden |
| M4 | MEDIUM | `components/ui/sheet.tsx` | Dual motion channels, 200ms | Single channel; align ~150–200ms ease-out |
| M5 | MEDIUM | `components/ui/tooltip.tsx` | Zoom on dense chrome | Fade-only or no transform |
| M6 | MEDIUM | `components/ui/skeleton.tsx` | Unconditional pulse | `motion-reduce:animate-none` |
| M7 | MEDIUM | Backdrop blur on dialog/sheet | Costly on dense UI | Prefer solid dim for Operate; blur optional |
| M8 | MEDIUM | `operate-enter` on many routes | Purposeful but needs RM gate; do not lengthen | Keep ≤280ms; under RM use opacity-only or none |
| M9 | LOW | Setup checklist progress width | OK as feedback | Keep width transition; skip hover flourishes under RM |

### 4.3 Rejected opportunities (do not animate)

- ⌘K open/close beyond a minimal fade (never zoom theater)  
- Table/board row stagger on load  
- Changes badge pulse  
- Checklist completion confetti  
- Active sidebar bounce  
- Diff/merge celebration choreography  
- Graph idle particles / auto-camera tours  
- Full-route shared-element transitions  

### 4.4 Allowed motion budget

| Purpose | Allowed |
|---------|---------|
| Feedback | Button `:active` scale ~0.97; progress width |
| Preventing jarring change | Overlay fade; sheet slide; `operate-enter` opacity |
| Spatial consistency | Sheet from edge; dialog centered (no wrong origin) |
| Explanation / delight | Marketing only (S1) — not console |

Easing house style (align with existing operate curve): `cubic-bezier(0.22, 1, 0.36, 1)` or stronger ease-out `cubic-bezier(0.23, 1, 0.32, 1)`. Never `ease-in` on UI chrome.

---

## 5. Visual system brief

1. Extend `components/operate/*` as the only empty/loading/header primitives for new pages.  
2. One radius scale (`--radius` family); no new pill-everything rule in product chrome.  
3. Sheets for peek/properties; dialogs for create/confirm; tooltips fade-only.  
4. Settings remain Account · Billing · People · Teams · Access · Webhooks · Connect AI.  
5. Historical `design/*.css` tokens: document-only; do not import conflicting warm palette into the app.

---

## 6. Motion plan stubs (Wave 2 expands)

Write full plans under `docs/superpowers/plans/` after user approves this spec:

| Stub | Title | Maps to |
|------|-------|---------|
| A | Reduced-motion baseline | M1, M6, M8 |
| B | Overlay chrome (dialog/sheet/tooltip/cmdk) | M2, M4, M5, M7 |
| C | Graph respect reduced-motion + tab visibility | M3 |
| D | Operate empty/loading/error consistency | C2–C4, C7 |

Max parallel polish: A→B→C; D can parallelize with A.

---

## 7. Testing (Wave 3)

- Toggle OS reduced-motion: no translate/zoom/pulse/graph thrash  
- Open ⌘K 10× rapidly: no zoom sluggishness; interruptible  
- `/graph` hidden tab does not burn CPU  
- Empty home, Changes, Agents use `OperateEmptyState`  
- No new motion library in `package.json` unless plan B explicitly fails with CSS  

---

## 8. Success

Craft + motion findings are enough to ship a polish PR and 3–4 motion fixes without taste debates. Implementers know what not to animate.
