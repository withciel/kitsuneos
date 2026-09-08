# S1 — Marketing Site Audit, Redesign Brief, and Activation

**Date:** 2026-09-08  
**Status:** Wave 1 design (ready for user review → Wave 2 plan)  
**Parent:** `2026-09-08-ui-program-charter-design.md`  
**Surface:** `apps/site` + activation handoff into `apps/app` onboarding  
**Mode:** Persuade (site); Persuade → Operate (activation bridge)

---

## 1. Problem

The marketing site is a small, coherent black+orange shell with sharp positioning copy, but the first viewport and below-fold patterns read as generic AI-landing (eyebrow, inset media card, three equal Grant/Propose/Review cards, heavy em-dashes, infinite hero glow). Activation stops at `/signup` and `/login` with no narrative tie to the shipped empty-workspace onboarding in the app.

---

## 2. Scope

**In**
- `apps/site/src/app/page.tsx`, `layout.tsx`, `globals.css`, `src/lib/urls.ts`, `src/lib/site-metadata.ts`
- Legal pages only as brand-chrome consistency (no policy rewrite)
- CTA intent alignment with app onboarding (`OperateEmptyState` / `SetupChecklist` / Connect)

**Out**
- Full console redesign (S2)
- WorkOS replacement
- New pricing product (keep free/Pro tease honest to PRD/billing)

---

## 3. Audit (evidence)

### 3.1 File map

| Path | Role |
|------|------|
| `apps/site/src/app/page.tsx` | Landing |
| `apps/site/src/app/layout.tsx` | Header/footer, fonts |
| `apps/site/src/app/globals.css` | Full visual system (no Tailwind) |
| `apps/site/src/lib/urls.ts` | `signUpUrl` / `signInUrl` |
| `apps/site/public/kitsune-agents-ad.*` | Live hero media |
| `apps/site/scripts/kitsune-agents-ad.html` | Richer ad storyboard (not wired) |
| Orphan | `proof-demo.*`, warm-palette favicon/404 leftovers |

### 3.2 Visual system (keep)

| Token | Value |
|-------|--------|
| `--k-bg` | `#050505` |
| `--k-orange` | `#f54e00` |
| Display | Fraunces |
| Body | Outfit |
| Radius | `--k-radius: 0.85rem`; CTAs `999px` |
| Ease | `cubic-bezier(0.22, 1, 0.36, 1)` |

Atmosphere via `body::before` radial orange washes is intentional — keep, do not replace with purple mesh.

### 3.3 Landing inventory

1. Hero — eyebrow, H1, lede, Start free / Sign in, inset 16:9 video  
2. `#trust` — Built by Ciel  
3. `#problem` — agents need writes  
4. `#place` — one workspace / equal principals  
5. `#how` — Grant / Propose / Review triad cards  
6. `#for` — ICP  
7. `#join` — close CTAs + plan tease  

Activation: `NEXT_PUBLIC_APP_ORIGIN` → `{origin}/signup` and `/login` only. No deep link to first-run steps.

### 3.4 Persuade / anti-slop findings

| Finding | Severity | Evidence |
|---------|----------|----------|
| Hero over budget + inset media card | HIGH | Eyebrow + multi-claim lede + twin CTAs + rounded media panel |
| Three equal Grant/Propose/Review cards | HIGH | `.triad` / `#how` |
| Em-dash density | HIGH | `page.tsx`, `layout.tsx`, metadata |
| Infinite `k-glow` on hero | MEDIUM | `globals.css` |
| Pill monoculture on all CTAs | MEDIUM | Header + hero + close |
| Brand chrome drift | MEDIUM | Warm stone favicon / `404.html` vs live black+orange |
| Reduced-motion video swap | KEEP | Poster fallback present |

### 3.5 Keep

- Positioning spine: agents write / humans keep control / one data plane  
- Black + `#f54e00` + Fraunces/Outfit  
- Env-overridable app origin CTAs  
- Product ad asset + richer storyboard in `scripts/kitsune-agents-ad.html`  
- Legal/footer hygiene and static export  

---

## 4. Redesign brief (targeted evolution)

**Posture:** Preserve brand and copy spine; recompose hero and kill card triad. Not a new visual world.

### 4.1 First viewport

- Full-bleed (or edge-to-edge) product video/atmosphere as the plane — not an inset rounded card  
- Brand wordmark (`Kitsune` + orange `OS`) as hero-level signal  
- One headline (≤2 lines), one supporting sentence (≤20 words), one primary CTA (**Start free**)  
- Sign in as text/secondary only  
- Drop hero eyebrow  
- No trust strip, plan tease, or feature bullets in the first viewport  

### 4.2 Below fold

- Collapse trust / problem / place into fewer bands; one job per section  
- Replace Grant/Propose/Review **cards** with a single narrative strip or sequenced moments tied to the product visual (verbs stay; equal bordered hover cards go)  
- Zero em-dashes in visible copy (hyphen or period)  
- Soften pill monoculture: primary filled orange; secondary is text link or outlined, not twin capsules  

### 4.3 Motion

- Keep one entrance (`k-rise` or equivalent ease-out)  
- Remove infinite `k-glow`  
- Prefer ad storyboard beats (agent → home → review) over ambient pulse  
- Preserve `prefers-reduced-motion` (static poster, no entrance transform)  

### 4.4 Chrome

- Retint favicon / static 404 / orphan proof assets to black+orange or delete unused proof media from the marketing story  

---

## 5. Activation story

### 5.1 Current

Site CTA → WorkOS signup/login → app callback → empty home + `SetupChecklist` (create DB → page → connect agent → Changes).

### 5.2 Target

| Step | Surface | Message |
|------|---------|---------|
| 1 | Site hero CTA | **Start free** (only signup intent label site-wide) |
| 2 | WorkOS | Unchanged AuthKit |
| 3 | App `/` empty | Same three actions as today; copy mirrors site promise (“shared workspace”, not a second product pitch) |
| 4 | Checklist / Connect | “Connect an agent” matches site claim; no “consent” language that oversells (see S3 honesty) |

**Deep link (pinned default):** First site pass keeps `signUpUrl` / `signInUrl` as today (`/signup`, `/login` on app origin). Rely on AuthKit’s existing post-login return to the app home empty state. Do not invent a parallel onboarding router on the site or new query-param protocol unless AuthKit already exposes a supported return URL we can set without custom middleware.

**One label per intent:** Start free = signup; Sign in = login. Do not add “Get started” / “Join” / “Create account” variants on the same page.

---

## 6. Error / empty / edge

- 404 page retinted to brand tokens  
- If app origin misconfigured, CTAs must still resolve via defaults in `urls.ts`  
- Reduced-motion users see poster, not a broken empty video frame  

---

## 7. Testing (Wave 3)

- Desktop + mobile first viewport: brand visible, CTA without scroll, no eyebrow  
- No `#how` three-card grid  
- Em-dash scan of visible strings = 0  
- CTA hits live `/signup` and `/login`  
- `prefers-reduced-motion`: no glow, no rise, poster shown  

---

## 8. Success

An implementer can rewrite `page.tsx` + `globals.css` (+ minor `urls`/`metadata`) from this brief without asking what the brand is, what the hero contains, or how activation labels map to the app.
