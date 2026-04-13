# Requirements — Fit Elite
Version: 1.0 | Generated: 2026-03-16

---

## v1 Requirements (Active)

### Architecture

| REQ-ID | Requirement | Source | Status |
|--------|-------------|--------|--------|
| ARCH-1 | Store/View separation in workout.js, analytics.js, claude.js | PROJECT.md / APP-AUDIT.md | Active |
| ARCH-2 | ES Modules migration — remove global namespace pollution | PROJECT.md / ARCHITECTURE.md | Active |
| ARCH-3 | JSDoc contracts on all public module APIs | PROJECT.md / APP-AUDIT.md | Active |
| ARCH-4 | server.js split into routes/ + lib/ structure | PROJECT.md / APP-AUDIT.md | Active |

### Performance

| REQ-ID | Requirement | Source | Status |
|--------|-------------|--------|--------|
| PERF-1 | DB coalescing on Dashboard — 1 getAll() instead of 4 | APP-AUDIT.md | Active |
| PERF-2 | Lazy initialization for analytics and AI modules | APP-AUDIT.md | Active |
| PERF-3 | Conditional Firebase SDK load (only when configured) | APP-AUDIT.md / CONCERNS.md | Active |
| PERF-4 | Service Worker: add missing files (db-firebase.js, supabase-check.js, plate-calc.js) | CONCERNS.md | Active |
| PERF-5 | Lighthouse baseline measurement + achieve score ≥ 90 | PROJECT.md / APP-AUDIT.md | Active |

### Design

| REQ-ID | Requirement | Source | Status |
|--------|-------------|--------|--------|
| DESIGN-1 | css/base.css with unified components (buttons, cards, inputs) | APP-AUDIT.md | Active |
| DESIGN-2 | WCAG AA contrast — raise --c-text-3 to #9ca3af (currently ~3.5:1, need 4.5:1) | APP-AUDIT.md | Active |
| DESIGN-3 | focus-visible on inputs via box-shadow (currently outline: none breaks keyboard nav) | APP-AUDIT.md | Active |
| DESIGN-4 | aria-label on all icon buttons (currently only FAB has label) | APP-AUDIT.md | Active |
| DESIGN-5 | Breakpoints system — handle <360px and tablet viewports | APP-AUDIT.md | Active |
| DESIGN-6 | Streak dots minimum 44px touch target (currently 28px) | APP-AUDIT.md | Active |

### AI

| REQ-ID | Requirement | Source | Status |
|--------|-------------|--------|--------|
| AI-1 | AI generates PPL program based on user profile and goals | PROJECT.md | Active |
| AI-2 | AI adapts load based on progress and fatigue scores | PROJECT.md | Active |
| AI-3 | In-workout AI dialog — real-time coaching during active session | PROJECT.md | Active |
| AI-4 | Progressive overload recommendations | PROJECT.md | Active |

---

## v2 Requirements (Deferred)

| REQ-ID | Requirement | Rationale for Deferral |
|--------|-------------|------------------------|
| ARCH-5 | TypeScript migration (tsc --noEmit) | JSDoc chosen as minimal-barrier alternative for v1; TS adds tooling overhead |
| ARCH-6 | IndexedDB version migration path (DB_VERSION > 1) | No schema changes planned for v1; required before any store additions |
| ARCH-7 | Custom plan migration from localStorage to IndexedDB | Low user impact currently; address before cloud sync expansion |
| PERF-6 | Body SVG caching in Claude module (invalidate only when scores change) | Minor allocation impact; lower priority than DB and SDK fixes |
| PERF-7 | Clock interval optimization (30s → 1s or 10s) | Low severity UI issue |
| DESIGN-7 | Deduplicate Workouts.delete vs Workouts.deleteById methods | Code cleanup; no user-facing impact |

---

## Out of Scope (v1)

| Item | Reason |
|------|--------|
| Social features (sharing, leaderboards) | Personal tracker — not a social app |
| Exercise video instructions | Complexity without proportional value |
| Paid subscription / monetization | Personal project |
| Light theme | Dark mode is the priority |
| Sync conflict resolution (Supabase + Firebase both configured) | Undefined behavior, but edge case outside core use |
| Input validation / rate limiting on /api/coach | Security hardening — separate concern from feature roadmap |

---

## Traceability Table

| REQ-ID | Requirement | Phase |
|--------|-------------|-------|
| ARCH-1 | Store/View separation | Phase 1 |
| ARCH-2 | ES Modules migration | Phase 1 |
| ARCH-3 | JSDoc contracts | Phase 1 |
| ARCH-4 | server.js → routes/ + lib/ | Phase 1 |
| PERF-1 | DB coalescing on Dashboard | Phase 2 |
| PERF-2 | Lazy init analytics + AI | Phase 2 |
| PERF-3 | Conditional Firebase SDK load | Phase 2 |
| PERF-4 | Service Worker missing files | Phase 2 |
| PERF-5 | Lighthouse baseline + score ≥ 90 | Phase 2 |
| DESIGN-1 | css/base.css unified components | Phase 3 |
| DESIGN-2 | WCAG AA contrast --c-text-3 | Phase 3 |
| DESIGN-3 | focus-visible on inputs | Phase 3 |
| DESIGN-4 | aria-label on icon buttons | Phase 3 |
| DESIGN-5 | Breakpoints system | Phase 3 |
| DESIGN-6 | Streak dots 44px touch target | Phase 3 |
| AI-1 | AI generates PPL program | Phase 4 |
| AI-2 | AI adapts load | Phase 4 |
| AI-3 | In-workout AI dialog | Phase 4 |
| AI-4 | Progressive overload recommendations | Phase 4 |
