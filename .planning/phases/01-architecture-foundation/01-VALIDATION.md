---
phase: 1
slug: architecture-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual grep + browser DevTools + curl (no test runner — Wave 0 installs arch-check scripts) |
| **Config file** | none — Wave 0 creates `test/arch-check.js` |
| **Quick run command** | `bash test/arch-check.sh` |
| **Full suite command** | `bash test/arch-check.sh && npm start && curl http://localhost:3000/api/firebase-config` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bash test/arch-check.sh`
- **After every plan wave:** Run full suite command above
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| Server refactor | 01 | 1 | ARCH-4 | bash | `wc -l server.js \| awk '$1 <= 30'` | ✅ | ⬜ pending |
| Routes extraction | 01 | 1 | ARCH-4 | bash | `ls routes/coach.js routes/integrations.js lib/anthropicClient.js` | ❌ W0 | ⬜ pending |
| No Anthropic in server | 01 | 1 | ARCH-4 | bash | `grep -c "new Anthropic" server.js \| grep "^0$"` | ✅ | ⬜ pending |
| ES module entry point | 02 | 2 | ARCH-2 | bash | `grep 'type="module"' index.html` | ✅ | ⬜ pending |
| No IIFE globals | 02 | 2 | ARCH-2 | browser | `test/arch-check.js` (window key scan) | ❌ W0 | ⬜ pending |
| claude.store.js exists | 03 | 3 | ARCH-1 | bash | `test -f js/claude.store.js` | ❌ W0 | ⬜ pending |
| claude.view.js exists | 03 | 3 | ARCH-1 | bash | `test -f js/claude.view.js` | ❌ W0 | ⬜ pending |
| Store has no DOM | 03 | 3 | ARCH-1 | bash | `grep -c "document\.\\\|innerHTML\\\|addEventListener" js/claude.store.js \| grep "^0$"` | ❌ W0 | ⬜ pending |
| analytics.store.js exists | 04 | 3 | ARCH-1 | bash | `test -f js/analytics.store.js` | ❌ W0 | ⬜ pending |
| analytics.view.js exists | 04 | 3 | ARCH-1 | bash | `test -f js/analytics.view.js` | ❌ W0 | ⬜ pending |
| workout.store.js exists | 05 | 4 | ARCH-1 | bash | `test -f js/workout.store.js` | ❌ W0 | ⬜ pending |
| workout.view.js exists | 05 | 4 | ARCH-1 | bash | `test -f js/workout.view.js` | ❌ W0 | ⬜ pending |
| JSDoc on db.js | 06 | 2 | ARCH-3 | bash | `grep -c "@param\|@returns" js/db.js \| awk '$1 >= 20'` | ✅ | ⬜ pending |
| JSDoc on store files | 06 | 4 | ARCH-3 | bash | `grep -c "@param\|@returns" js/workout.store.js` | ❌ W0 | ⬜ pending |
| sw.js cache bumped | 07 | 5 | ARCH-2 | bash | `grep "CACHE_NAME.*v3" sw.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/arch-check.sh` — bash script running all grep/file-existence checks above
- [ ] `test/arch-check.js` — browser-loadable script scanning `window` for forbidden globals
- [ ] `routes/` directory stub — so file-existence checks don't error early
- [ ] `lib/` directory stub — so file-existence checks don't error early

*Existing infrastructure: No test runner detected. Wave 0 creates lightweight shell scripts.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| App loads without console errors after ES module migration | ARCH-2 | Requires browser; no headless runner | Open index.html in browser, check Console for errors on all 5 screens (Dashboard, Workout, Analytics, Coach, Profile) |
| `window.Workout` intentional bridge (not accidental IIFE leak) | ARCH-2 | Semantic intent check | In DevTools: confirm `window.Workout` is defined in `app.js` via explicit assignment, not from module side-effect |
| onclick handlers still work after ES Module migration | ARCH-2 | Runtime interaction | Test: Add workout, start session, complete set, navigate to analytics — all buttons must respond |
| RestTimer still functions after extraction | ARCH-1 | Runtime interaction | Start a workout, complete a set — rest timer must appear and count down correctly |
| JSDoc type hints display in VS Code | ARCH-3 | IDE integration | Hover over `DB.Workouts.add(` in workout.store.js — must show typed parameter tooltip |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
