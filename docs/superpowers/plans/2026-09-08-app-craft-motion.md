# App Craft Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the KitsuneOS console respect `prefers-reduced-motion`, quiet high-frequency overlay motion (especially ⌘K), pause graph simulation when appropriate, and standardize empty/loading/error chrome on operate helpers.

**Architecture:** Prefer CSS gates in `globals.css` plus surgical class changes on shadcn primitives. Do not add Framer Motion. Extend existing `operate-enter` utilities rather than inventing a second motion system. Reuse `OperateEmptyState` / `LoadingBlock` / `PageHeader` shipped on main.

**Tech Stack:** Next.js app (`apps/app`), Tailwind v4 + `tw-animate-css`, shadcn/Radix, d3-force, `node:test`, Biome.

## Global Constraints

- Operate mode: no route-transition theater, confetti, badge pulse, table row stagger.
- Never animate ⌘K with zoom; fade-only (or instant under reduced motion).
- House ease: `cubic-bezier(0.22, 1, 0.36, 1)` or `cubic-bezier(0.23, 1, 0.32, 1)`; never `ease-in` on chrome.
- Animate `transform`/`opacity` only; UI durations ≤300ms.
- No new motion library in `package.json`.
- Spec: `docs/superpowers/specs/2026-09-08-app-craft-motion-design.md`.

## File map

| File | Responsibility |
|------|----------------|
| `apps/app/src/app/globals.css` | Reduced-motion gates for `operate-enter*` and utility helpers |
| `apps/app/src/components/ui/dialog.tsx` | Fade-only content; solid dim overlay |
| `apps/app/src/components/ui/sheet.tsx` | Align duration/easing; RM-friendly |
| `apps/app/src/components/ui/tooltip.tsx` | Remove zoom |
| `apps/app/src/components/ui/skeleton.tsx` | `motion-reduce:animate-none` |
| `apps/app/src/components/shell/command-palette.tsx` | Ensure dialog path is fade-only |
| `apps/app/src/components/graph/force-graph.tsx` | RM static layout; pause when hidden |
| `apps/app/src/lib/motion-preferences.ts` | **New** — `prefersReducedMotion()` helper for client components |
| `apps/app/src/lib/motion-preferences.test.ts` | **New** — pure helper tests if window mocked |
| Scattered empty states | Adopt `OperateEmptyState` where hand-rolled |

---

### Task 1: Reduced-motion CSS baseline

**Files:**
- Modify: `apps/app/src/app/globals.css`

**Interfaces:**
- Produces: global `@media (prefers-reduced-motion: reduce)` rules covering `.operate-enter`, `.operate-enter-fast`, and a utility `.motion-safe-only` if needed.

- [ ] **Step 1: Append reduced-motion block to `globals.css`**

```css
@media (prefers-reduced-motion: reduce) {
  .operate-enter,
  .operate-enter-fast {
    animation: none !important;
  }

  .animate-pulse {
    animation: none !important;
  }
}
```

Also ensure `@keyframes operate-enter` remains for users without RM; do not lengthen beyond 0.28s.

- [ ] **Step 2: Visual sanity**

Run app dev server; toggle OS reduced-motion; confirm list pages no longer translate on enter.

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/globals.css
git commit -m "fix(app): gate operate-enter and pulse under reduced-motion"
```

---

### Task 2: Dialog, sheet, tooltip, skeleton chrome

**Files:**
- Modify: `apps/app/src/components/ui/dialog.tsx`
- Modify: `apps/app/src/components/ui/sheet.tsx`
- Modify: `apps/app/src/components/ui/tooltip.tsx`
- Modify: `apps/app/src/components/ui/skeleton.tsx`

**Interfaces:**
- Consumes: existing Radix/`cn` patterns
- Produces: fade-only dialog content classes (no `zoom-in-95` / `zoom-out-95` on DialogContent)

- [ ] **Step 1: Dialog overlay + content**

In `dialog.tsx`:
- Overlay: keep fade; prefer `bg-black/50` (or existing dim) **without** `supports-backdrop-filter:backdrop-blur-xs` for Operate (remove blur).
- Content: remove `data-open:zoom-in-95` and `data-closed:zoom-out-95`; keep `fade-in-0` / `fade-out-0` and `duration-100`.

- [ ] **Step 2: Tooltip**

In `tooltip.tsx` `TooltipContent` className: remove `zoom-in-95` / `zoom-out-95`; keep fade (+ optional slide-from-side is acceptable if already present; under RM, tw-animate should be gated — if tw-animate does not honor RM, add `motion-reduce:animate-none` / `max-md:` not required).

Add Tailwind: `motion-reduce:animate-none` on tooltip content if available in this Tailwind v4 setup; otherwise rely on a small global rule:

```css
@media (prefers-reduced-motion: reduce) {
  [data-slot='tooltip-content'],
  [data-slot='dialog-content'],
  [data-slot='sheet-content'] {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 3: Sheet**

Align to a single motion story: keep slide-in from edge OR fade, not both stacked with conflicting easings. Use `duration-200` max and ease-out curve. Remove backdrop blur if present (solid dim).

- [ ] **Step 4: Skeleton**

```tsx
className={cn('animate-pulse motion-reduce:animate-none rounded-md bg-muted', className)}
```

If `motion-reduce` variant missing, the globals rule from Step 2 covers `.animate-pulse`.

- [ ] **Step 5: Typecheck / Biome on touched files**

Run: `cd /workspace && pnpm --filter @kitsuneos/app exec tsc --noEmit` (or repo’s standard typecheck script)  
Expected: no new errors in touched files

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/components/ui/dialog.tsx apps/app/src/components/ui/sheet.tsx apps/app/src/components/ui/tooltip.tsx apps/app/src/components/ui/skeleton.tsx apps/app/src/app/globals.css
git commit -m "fix(app): quiet overlay motion and remove dialog zoom"
```

---

### Task 3: Command palette verification

**Files:**
- Modify: `apps/app/src/components/shell/command-palette.tsx` (only if it bypasses Dialog primitives)

- [ ] **Step 1: Confirm palette uses `Dialog` from `@/components/ui/dialog`**

If yes, Task 2 already fixed zoom. If it applies its own `zoom-in-95` classes, remove them (fade only).

- [ ] **Step 2: Manual feel-check**

Open ⌘K ten times rapidly; should feel instant (≤100ms fade), no scale pop.

- [ ] **Step 3: Commit only if file changed**

```bash
git add apps/app/src/components/shell/command-palette.tsx
git commit -m "fix(app): fade-only command palette chrome"
```

---

### Task 4: Graph reduced-motion + visibility pause

**Files:**
- Create: `apps/app/src/lib/motion-preferences.ts`
- Create: `apps/app/src/lib/motion-preferences.test.ts`
- Modify: `apps/app/src/components/graph/force-graph.tsx`

**Interfaces:**
- Produces: `export function prefersReducedMotion(): boolean`
- Graph: when RM true, place nodes in a static layout (circle or grid) with `simulation.stop()`; when `document.hidden`, `simulation.stop()`, resume on visible if not RM.

- [ ] **Step 1: Write helper + test**

```ts
// motion-preferences.ts
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

```ts
// motion-preferences.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prefersReducedMotion } from './motion-preferences.ts';

describe('prefersReducedMotion', () => {
  it('returns false without window matchMedia', () => {
    assert.equal(prefersReducedMotion(), false);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm exec node --test apps/app/src/lib/motion-preferences.test.ts`  
Expected: PASS

- [ ] **Step 3: Wire `force-graph.tsx`**

Inside the simulation `useEffect`:
1. Import `prefersReducedMotion`.
2. If true: assign fixed `x`/`y` (e.g. circle around center), call `simulation.stop()`, skip ticking, still allow zoom/drag if cheap — or disable drag under RM (prefer static + click to navigate).
3. Subscribe to `visibilitychange`: if `document.hidden` then `simulation.stop()`; else if !RM restart `simulation.alphaTarget(0.3).restart()` briefly then cool down.

- [ ] **Step 4: Manual check**

`/graph` with RM on: no CPU thrash; nodes readable. Hidden tab: simulation paused (verify via performance monitor if available).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/lib/motion-preferences.ts apps/app/src/lib/motion-preferences.test.ts apps/app/src/components/graph/force-graph.tsx
git commit -m "fix(app): pause graph force layout for reduced-motion and hidden tabs"
```

---

### Task 5: Operate empty/loading consistency (sample high-traffic pages)

**Files:**
- Modify as needed: settings panels that still hand-roll empty/loading; sidebar loading if missing
- Prefer: `apps/app/src/components/operate/empty-state.tsx`, `loading-block.tsx`

- [ ] **Step 1: Audit remaining hand-rolled empties**

Grep for `No .* yet` / dashed borders / ad-hoc empty markup outside `OperateEmptyState`. Migrate at least: one settings panel, sidebar schema loading placeholder if absent.

- [ ] **Step 2: Use `LoadingBlock` or skeletons with RM-safe pulse**

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/components/shell/app-sidebar.tsx apps/app/src/app/\(workspace\)/settings/**/*.tsx
git commit -m "fix(app): standardize empty and loading chrome on operate helpers"
```

---

### Task 6: Verify S2 success criteria

- [ ] Reduced-motion: no translate/zoom/pulse/graph thrash  
- [ ] ⌘K fade-only  
- [ ] No Framer Motion dependency added  
- [ ] Typecheck + existing app unit tests pass:

```bash
pnpm exec node --test apps/app/src/lib/*.test.ts
```

---

## Spec coverage (self-review)

| Spec ID | Task |
|---------|------|
| M1, M6, M8 | Task 1 |
| M2, M4, M5, M7 | Task 2–3 |
| M3 | Task 4 |
| C2–C4, C7 | Task 5 |
| Rejected motion list | Honored by Global Constraints (no tasks that add them) |
