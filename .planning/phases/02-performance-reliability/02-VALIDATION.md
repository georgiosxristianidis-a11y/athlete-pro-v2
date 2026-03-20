---
phase: 2
slug: performance-reliability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser verification + Lighthouse CLI |
| **Config file** | none — Vanilla JS PWA, no test framework |
| **Quick run command** | `node -e "const fs=require('fs'); ['js/dashboard.js','js/db.js','js/db-firebase.js','sw.js','js/app.js'].forEach(f => { if(!fs.existsSync(f)) throw f+' missing' }); console.log('OK')"` |
| **Full suite command** | `npx lighthouse http://localhost:3000 --output=json --chrome-flags="--headless" --only-categories=performance` |
| **Estimated runtime** | ~15 seconds (Lighthouse), <1s (file checks) |

---

## Sampling Rate

- **After every task commit:** Run quick file existence + grep verification
- **After every plan wave:** Manual browser test (DevTools Network tab, IndexedDB profiler)
- **Before `/gsd:verify-work`:** Lighthouse score check + full manual walkthrough
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | PERF-1 | grep+manual | `grep -c "getAll" js/dashboard.js` (expect 1) | ✅ | ⬜ pending |
| 02-02-01 | 02 | 1 | PERF-2 | grep+manual | `grep "lazy\|deferred\|firstVisit" js/app.js` | ✅ | ⬜ pending |
| 02-03-01 | 03 | 1 | PERF-3 | grep+manual | `grep "firebase" index.html \| grep -v "dynamic\|conditional"` (expect 0 unconditional) | ✅ | ⬜ pending |
| 02-04-01 | 04 | 2 | PERF-4 | grep | `grep "db-firebase\|supabase-check\|plate-calc" sw.js` (expect all 3) | ✅ | ⬜ pending |
| 02-05-01 | 05 | 2 | PERF-5 | lighthouse | `npx lighthouse ... --only-categories=performance` (score ≥ 90) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Lighthouse CLI installed (`npx lighthouse --version` succeeds)
- [ ] Dev server running on localhost:3000 for Lighthouse tests

*Existing infrastructure covers file-check and grep verifications.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard loads with 1 IDB transaction | PERF-1 | IndexedDB profiling requires DevTools | Open DevTools > Application > IndexedDB, reload dashboard, count transaction events |
| Firebase SDK not loaded when unconfigured | PERF-3 | Network waterfall inspection | Open DevTools > Network, filter "firebase", reload — expect 0 requests |
| Analytics deferred to first visit | PERF-2 | Module init timing requires DevTools | Reload app, check Network/Console — analytics.view.js should not execute until Stats tab |
| Offline mode works | PERF-4 | SW cache behavior requires real browser | DevTools > Network > Offline, reload, navigate all screens |
| Lighthouse ≥ 90 | PERF-5 | Lighthouse requires headless Chrome | Run Lighthouse CLI or DevTools audit on mobile profile |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
