# Fit Elite — Roadmap
Version: 1.0 | Generated: 2026-03-16

---

## Milestone 1.0 — Elite Foundation

### Phase 1: Architecture Foundation
**Goal:** Eliminate global namespace pollution and mixed-concern monoliths. Establish clear Store/View boundaries, explicit module contracts, and a maintainable server structure — making the codebase safe to extend without silent breakage.

**Requirements:** ARCH-1, ARCH-2, ARCH-3, ARCH-4

**Tasks:**
- Split workout.js, analytics.js, claude.js into Store (state + DB ops) and View (render + event handlers) layers
- Migrate all JS modules from global IIFE pattern to ES Modules with explicit imports/exports
- Add JSDoc @typedef and @param/@returns annotations to all public APIs in db.js, workout.js, claude.js, analytics.js
- Refactor server.js (153 lines, one file) into: server.js (init + listen), routes/coach.js, routes/integrations.js, lib/anthropicClient.js

**Success criteria:**
1. No module exposes globals to window — all cross-module dependencies are explicit ES imports
2. Each of workout, analytics, and claude has a distinct state/store file and a distinct view file
3. All public functions in db.js and the four major modules have JSDoc type annotations
4. server.js is under 30 lines; route handlers live in routes/; Anthropic client init lives in lib/

---

### Phase 2: Performance & Reliability
**Goal:** Eliminate redundant DB reads on the critical path, defer heavy module initialization, stop loading ~100KB of Firebase SDK unconditionally, and ensure all app files are available offline.

**Requirements:** PERF-1, PERF-2, PERF-3, PERF-4, PERF-5

**Plans:** 3 plans

Plans:
- [ ] 02-01-PLAN.md — Conditional Firebase SDK load + SW ASSETS verification
- [ ] 02-02-PLAN.md — Dashboard DB coalescing + analytics lazy init
- [ ] 02-03-PLAN.md — SW cache bump + Lighthouse score measurement

**Tasks:**
- DB coalescing: replace 4 separate getAll() calls in Dashboard.load() with 1 getAll() that passes the array to weeklyVolume(), monthlyCount(), pplTonnage(), weeklyTrend()
- Lazy init: move analytics.js and claude.js initialization to first Nav.go() call for their respective screens
- Conditional Firebase: check /api/firebase-config first; dynamically inject Firebase CDN scripts only when configured: true
- Service Worker: add js/db-firebase.js, js/supabase-check.js, js/plate-calc.js to the ASSETS precache list in sw.js
- Lighthouse: capture baseline score, then optimize until score ≥ 90

**Success criteria:**
1. Dashboard.load() triggers exactly 1 IndexedDB transaction, not 4
2. Firebase CDN scripts (100KB+) are not requested when Firebase is not configured
3. Analytics and AI modules do not initialize on app start — only on first screen visit
4. All JS files are included in sw.js precache — app works fully offline
5. Lighthouse performance score ≥ 90 on mobile profile

---

### Phase 3: Design System
**Goal:** Consolidate six CSS files into a coherent design system with shared components, achieve WCAG AA accessibility compliance, and fix touch target and keyboard navigation gaps.

**Requirements:** DESIGN-1, DESIGN-2, DESIGN-3, DESIGN-4, DESIGN-5, DESIGN-6

**Tasks:**
- Create css/base.css with canonical button, card, and input component styles; audit all 6 CSS files for token usage consistency
- Raise --c-text-3 from #6b7280 (3.5:1 contrast) to #9ca3af (meets WCAG AA 4.5:1)
- Replace outline: none on input/textarea with a visible focus-visible state using box-shadow
- Add aria-label to all icon-only buttons (currently only FAB has a label)
- Implement 2-3 explicit breakpoint variables; verify layout on <360px and tablet viewports
- Increase streak dot touch target from 28px to minimum 44px (width/height or padding)

**Success criteria:**
1. css/base.css exists and all screen-level CSS files import shared component styles from it
2. --c-text-3 is #9ca3af or higher contrast — no WCAG AA violations on body text
3. All input and textarea elements show a visible focus indicator when navigated via keyboard
4. All icon buttons have aria-label attributes — passes axe/Lighthouse accessibility audit
5. App layout is usable at 360px width and on 768px tablet without overflow or clipping
6. Streak dots meet 44px minimum tap target dimension

---

### Phase 4: AI Autopilot
**Goal:** Elevate the AI coach from a reactive chat panel to an active training partner — one that builds the program, adapts it after every session, and provides real-time guidance during workouts.

**Requirements:** AI-1, AI-2, AI-3, AI-4

**Tasks:**
- AI program generation: on first use (or on request), AI generates a full PPL weekly schedule tailored to user profile, goals, and available equipment
- Adaptive load: after each completed workout, AI analyzes tonnage, fatigue scores, and RPE to recommend next-session weights and volume adjustments
- In-workout dialog: AI coach accessible during active workout session — can answer questions, suggest modifications, and respond to RPE feedback in real time via SSE
- Progressive overload engine: systematic recommendations for weight/rep increases based on historical 1RM trends and session performance

**Success criteria:**
1. New users receive a generated PPL program within their first session without manual configuration
2. Post-workout summary includes AI-generated load recommendations for the next session of the same type
3. AI chat is accessible and functional from within the active workout screen (not only from the AI panel)
4. Progressive overload suggestions appear on the exercise selection screen based on 1RM history

---

## Requirement Coverage

| REQ-ID | Requirement | Phase |
|--------|-------------|-------|
| ARCH-1 | Store/View separation in workout.js, analytics.js, claude.js | Phase 1 |
| ARCH-2 | ES Modules migration — remove global namespace | Phase 1 |
| ARCH-3 | JSDoc contracts on all public APIs | Phase 1 |
| ARCH-4 | server.js → routes/ + lib/ split | Phase 1 |
| PERF-1 | DB coalescing on Dashboard (1 getAll instead of 4) | Phase 2 |
| PERF-2 | Lazy init for analytics + AI modules | Phase 2 |
| PERF-3 | Conditional Firebase SDK load | Phase 2 |
| PERF-4 | Service Worker: add missing files | Phase 2 |
| PERF-5 | Lighthouse baseline + score ≥ 90 | Phase 2 |
| DESIGN-1 | css/base.css with unified components | Phase 3 |
| DESIGN-2 | WCAG AA contrast (--c-text-3 → #9ca3af) | Phase 3 |
| DESIGN-3 | focus-visible on inputs via box-shadow | Phase 3 |
| DESIGN-4 | aria-label on all icon buttons | Phase 3 |
| DESIGN-5 | Breakpoints system (<360px, tablet) | Phase 3 |
| DESIGN-6 | Streak dots → 44px touch target | Phase 3 |
| AI-1 | AI generates PPL program based on user profile/goals | Phase 4 |
| AI-2 | AI adapts load based on progress and fatigue scores | Phase 4 |
| AI-3 | In-workout AI dialog (real-time coaching during session) | Phase 4 |
| AI-4 | Progressive overload recommendations | Phase 4 |
