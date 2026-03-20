# Phase 2: Performance & Reliability - Research

**Researched:** 2026-03-20
**Domain:** Browser performance, PWA service workers, lazy module initialization, IndexedDB access patterns
**Confidence:** HIGH

---

## Summary

Phase 2 targets five concrete performance problems that were identified during the app audit. All five have been fully analysed against the current source — the exact lines to change are known, there are no discovery tasks, and no third-party libraries need to be added. This is a surgical refactoring phase operating entirely within the existing Vanilla JS codebase.

The critical path item is PERF-3 (conditional Firebase SDK): two Firebase CDN scripts (~100 KB combined) are injected unconditionally in `index.html` before the app module loads. Removing them and replacing with a runtime dynamic-inject path is the single change with the largest impact on mobile Lighthouse score. The DB coalescing (PERF-1) and lazy init (PERF-2) reduce the number of IndexedDB transactions and defer CPU-heavy module evaluation respectively, but they have smaller Lighthouse-score impact than the CDN script removal.

PERF-4 (service worker precache completeness) was partially resolved in Phase 1, Plan 06: `db-firebase.js`, `supabase-check.js`, and `plate-calc.js` were added to the ASSETS list and the cache name was bumped to `athlete-pro-v4`. The current `sw.js` already contains all required files. PERF-4 as-written is therefore already done — the planner should verify current state and record the finding rather than re-doing the work.

PERF-5 (Lighthouse baseline + ≥ 90 score) is a measurement and validation task that gates the phase rather than implementing a feature; it must run after all other PERF items are complete.

**Primary recommendation:** Implement PERF-3 first (Firebase conditional load), then PERF-1 (DB coalescing), then PERF-2 (lazy init), then capture the Lighthouse score.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERF-1 | DB coalescing on Dashboard — 1 getAll() instead of 4 | Dashboard.load() confirmed: 6-way Promise.all with 4 Workouts.getAll()-derived calls. Refactor approach documented. |
| PERF-2 | Lazy initialization for analytics and AI modules | app.js imports analytics.view.js and claude.view.js at startup unconditionally; deferred import() approach documented. |
| PERF-3 | Conditional Firebase SDK load (only when configured) | Two gstatic CDN script tags confirmed in index.html lines 773-774. Dynamic inject approach documented. |
| PERF-4 | Service Worker: add missing files (db-firebase.js, supabase-check.js, plate-calc.js) | Already present in sw.js ASSETS (athlete-pro-v4). Verify and record — no code change needed. |
| PERF-5 | Lighthouse baseline measurement + achieve score ≥ 90 | Run after PERF-1/2/3. CLI tooling approach documented. |
</phase_requirements>

---

## Current State Audit (What Actually Exists)

### PERF-1: Dashboard DB calls

`Dashboard.load()` in `js/dashboard.js` lines 347-354 makes a 6-item `Promise.all`:

```js
const [allWorkouts, weekVol, monthVol, monthCount, ppl, orms] = await Promise.all([
  DB.Workouts.getAll(),        // Transaction 1
  DB.Workouts.weeklyVolume(),  // Transaction 2 — internally calls getAll()
  DB.Workouts.monthlyVolume(), // Transaction 3 — internally calls getAll()
  DB.Workouts.monthlyCount(),  // Transaction 4 — internally calls getAll()
  DB.Workouts.pplTonnage(),    // Transaction 5 — internally calls getAll()
  DB.OneRM.getAll(),           // Transaction 6 — different store, keep
]);
```

Every `weeklyVolume()`, `monthlyVolume()`, `monthlyCount()`, and `pplTonnage()` method in `db.js` calls `this.getAll()` internally (lines 164-204). That is 5 separate IndexedDB transactions for the same data set, plus 1 for OneRM. The fix is: call `DB.Workouts.getAll()` once, pass the result to in-memory computation functions.

`weeklyTrend()` in `analytics.store.js` also calls `DB.Workouts.getAll()` — it is NOT called from Dashboard.load(), so it is not part of this coalescing task. It remains untouched.

### PERF-2: Module initialization at startup

`app.js` has static top-level imports for all modules:

```js
import { Analytics } from './analytics.view.js';
import { Claude } from './claude.view.js';
import { MUSCLE_MAP, Heatmap } from './claude.store.js';
import { FirebaseDB } from './db-firebase.js';
```

At module evaluation time, `claude.store.js` builds its `MUSCLE_MAP` object and `Heatmap` closure. `analytics.view.js` sets up module-level constants. `claude.view.js` builds the large inline SVG body map string builder. None of these execute heavy async work at module level, but they do parse and evaluate substantial code before the dashboard is visible.

The `renderFAB()` call on `app.js` line 81 runs `Claude.renderFAB()` at boot — this is the one truly eager init in the Claude module. The plan task description says to defer analytics.js and claude.js init to "first Nav.go() call for their respective screens".

**Approach:** Replace static imports with dynamic `import()` inside `shell.js` Nav handlers. The `_handlers` map in `shell.js` (lines 8-14) already defers screen loading to navigation time — this is the correct injection point. The window.* bridge assignments in `app.js` also need to be deferred accordingly.

**Constraint:** `Claude.renderFAB()` is called at boot (app.js line 81). If claude.view.js is lazy-loaded, `renderFAB()` must either (a) be called after the dynamic import resolves, or (b) the FAB rendering must be split out as a lightweight synchronous module. The simplest path: keep claude.view.js as a static import (the FAB is critical UI), but defer the Heatmap computation inside `claude.store.js` to first open of the AI panel.

### PERF-3: Unconditional Firebase CDN load

`index.html` lines 772-774:

```html
<!-- ── Firebase compat SDK (must load before modules) ── -->
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
```

These load synchronously before `<script type="module" src="js/app.js">`. Both scripts together total ~100 KB transferred (minified + gzip from gstatic CDN). When Firebase is not configured (the default for most users), this is pure waste.

`db-firebase.js` exposes `autoInit()` which already calls `GET /api/firebase-config`. If `configured: false`, it returns null and does nothing. The problem is the SDK scripts themselves must be present before `db-firebase.js` tries to call `firebase.initializeApp()`.

**Fix approach:** Remove both `<script>` tags from index.html. In `db-firebase.js`, before calling `firebase.initializeApp()`, dynamically inject the SDK scripts and wait for them to load. The `autoInit()` function already has the right structure — it just needs script injection before the `init(cfg)` call.

```js
// Inside autoInit(), after cfg.configured === true:
await loadFirebaseSDK(); // new helper — injects scripts if not already present
return init(cfg);
```

```js
function loadFirebaseSDK() {
  if (window.firebase) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s1 = document.createElement('script');
    s1.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js';
      s2.onload = resolve;
      s2.onerror = reject;
      document.head.appendChild(s2);
    };
    s1.onerror = reject;
    document.head.appendChild(s1);
  });
}
```

The scripts must remain sequential (firestore depends on firebase-app), hence the nested structure.

### PERF-4: Service Worker precache — ALREADY DONE

Current `sw.js` (confirmed by reading the file):
- `CACHE_NAME = 'athlete-pro-v4'`
- ASSETS already includes `db-firebase.js`, `supabase-check.js`, `plate-calc.js`

The Phase 1 Plan 06 task noted this as "incidental fix." The Phase 2 task list as stated in the objective says to add these files — they are already there. The planner should write a verification task that confirms the current state and records it, not a code-change task.

### PERF-5: Lighthouse measurement

No Lighthouse setup exists in the project. The test directory has `smoke.test.js` and `pwa.test.js` using Node's built-in test runner. Lighthouse CLI requires a running server and a browser.

The project runs on Express (`node server.js`, port 3000 by default). Lighthouse CLI (`lighthouse`) can run against `http://localhost:3000` once the server is up.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| IndexedDB (native) | Browser API | Client data storage | Already in use — no change |
| Service Worker (native) | Browser API | Offline caching | Already in use — no change |
| Dynamic `import()` | ES2020 | Lazy module loading | Native, no dependency needed |
| Lighthouse CLI | 12.x (current) | Performance scoring | Google's official tool, integrates with Chrome |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node built-in test | Node 18+ | Server-side smoke tests | Already used in `test/` |
| `chrome-launcher` | Lighthouse dependency | Headless Chrome for Lighthouse CI | Used indirectly via Lighthouse CLI |

**No new npm dependencies are required for PERF-1, 2, 3, or 4.** Lighthouse CLI is a devDependency used only for measurement.

**Installation (Lighthouse only):**
```bash
npm install --save-dev lighthouse
```

**Version verification (Lighthouse):**
```bash
npm view lighthouse version
# As of 2026-03-20: 12.x expected — verify before installing
```

---

## Architecture Patterns

### Pattern 1: DB Coalescing — Pass array to pure functions

**What:** Replace multiple `getAll()` calls with one, pass the result array into functions that compute derived values.

**When to use:** Any dashboard or summary screen that renders multiple aggregates from the same store.

**Example — refactored Dashboard.load():**
```js
// Before: 5 separate transactions
const [allWorkouts, weekVol, monthVol, monthCount, ppl, orms] = await Promise.all([
  DB.Workouts.getAll(),
  DB.Workouts.weeklyVolume(),
  DB.Workouts.monthlyVolume(),
  DB.Workouts.monthlyCount(),
  DB.Workouts.pplTonnage(),
  DB.OneRM.getAll(),
]);

// After: 2 transactions, 4 in-memory computations
const [allWorkouts, orms] = await Promise.all([
  DB.Workouts.getAll(),
  DB.OneRM.getAll(),
]);
const weekVol   = weeklyVolumeFrom(allWorkouts);
const monthVol  = monthlyVolumeFrom(allWorkouts);
const monthCount = monthlyCountFrom(allWorkouts);
const ppl       = pplTonnageFrom(allWorkouts);
```

The helper functions are pure: they accept an array and return a value. They do NOT call `this.getAll()` internally. These helpers can live in `db.js` as exported pure functions alongside the existing methods, or inline in `dashboard.js`.

**Key constraint:** The existing `DB.Workouts.weeklyVolume()` etc. methods must NOT be removed — they are part of the public API and may be called by other screens (analytics). Only `Dashboard.load()` is changed; `db.js` methods remain intact but get new companion pure-function variants.

### Pattern 2: Conditional SDK Injection

**What:** Fetch config endpoint first; only if `configured: true` inject CDN script tags programmatically.

**When to use:** Any optional third-party SDK that is not needed by all users.

**Implementation location:** `js/db-firebase.js` `autoInit()` function.

**Sequencing contract:** Firebase Firestore SDK depends on Firebase App SDK. Scripts must load in order: `firebase-app-compat.js` first, then `firebase-firestore-compat.js`. Use sequential `onload` callbacks, not `Promise.all` with two simultaneous script tags.

### Pattern 3: Deferred Navigation Handler

**What:** Nav.go() handlers in `shell.js` already run lazily on first screen visit. For heavy modules, replace eager static import with `import()` inside the handler.

**When to use:** Modules that are only needed on a specific screen and have significant parse/eval cost.

**Example (analytics.view.js):**
```js
// shell.js _handlers
's-stats': async () => {
  if (!window.Analytics) {
    const { Analytics } = await import('./analytics.view.js');
    window.Analytics = Analytics;
  }
  window.Analytics.load();
},
```

**Constraint:** The `window.*` bridge currently set in `app.js` must be removed for lazily-loaded modules (the property is set inside the import callback instead). The `onclick="Analytics.load()"` handlers in HTML use `window.Analytics`, so as long as the bridge is set before any onclick fires, this is safe.

### Anti-Patterns to Avoid

- **Removing `db.js` computed methods:** `weeklyVolume()`, `pplTonnage()` etc. are used by analytics.store.js — do not delete them, add pure-function variants.
- **Loading Firebase scripts with `async` attribute:** Firebase App must be fully evaluated before Firestore; `async` loading can cause race conditions.
- **Parallel script injection for sequential SDK:** Do not create both script tags simultaneously with `Promise.all` — Firestore will fail if App SDK hasn't evaluated yet.
- **Lazy-loading claude.view.js when renderFAB() is boot-critical:** The FAB renders at startup. Either keep claude.view.js static or split `renderFAB` into a minimal module.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Performance scoring | Custom metric collection | Lighthouse CLI | Captures 80+ metrics, mobile throttling, CLS, LCP, TTI — cannot replicate correctly by hand |
| Script loading order | Promise chain hacks | Sequential onload callbacks (see Pattern 2) | Simple, correct, no dependencies |
| Module lazy loading | Custom module registry | Native `import()` | Already in ES2020, zero overhead |

---

## Common Pitfalls

### Pitfall 1: Breaking analytics screen when deferring Analytics module

**What goes wrong:** If `Analytics` is removed from the static import in `app.js` and the window bridge is set lazily, any `onclick="Analytics.calPrev()"` handler in the analytics screen HTML that fires before the first `Nav.go('s-stats')` will throw `Analytics is not defined`.

**Why it happens:** The analytics HTML is rendered by `Analytics.load()` — those `onclick` handlers only exist after the screen is rendered. But if the module hasn't loaded yet, window.Analytics is undefined.

**How to avoid:** The lazy import must complete and set `window.Analytics` before `Analytics.load()` returns. Since `Analytics.load()` renders the HTML containing the onclick handlers, by the time any handler fires, `window.Analytics` is already set.

**Warning signs:** `Uncaught ReferenceError: Analytics is not defined` in console on first navigation to stats screen.

### Pitfall 2: Firebase autoInit timing

**What goes wrong:** `db-firebase.js` is imported statically in `app.js` and `window.FirebaseDB` is set at boot. If `autoInit()` is called anywhere at startup (it is NOT currently — confirmed by grep), removing the CDN scripts would break it.

**Why it happens:** `firebase` global does not exist until the CDN scripts execute.

**How to avoid:** Confirm `autoInit()` is only called by user action (profile screen sync button). This is currently the case — `autoInit` is never called automatically in `app.js` or any boot path.

**Warning signs:** `ReferenceError: firebase is not defined` at boot after removing CDN script tags.

### Pitfall 3: Service worker cache version not bumped

**What goes wrong:** Old cached `index.html` (without the Firebase script tags) and old cached `db-firebase.js` (without the SDK injection code) continue to serve from the old cache.

**Why it happens:** Service worker cache-first strategy serves stale files until the cache is invalidated.

**How to avoid:** Bump `CACHE_NAME` from `athlete-pro-v4` to `athlete-pro-v5` when making any changes to `index.html` or `js/*.js` files in this phase. The activate handler already prunes old caches.

**Warning signs:** After deploying changes, app still shows Firebase CDN scripts being requested in DevTools Network tab on next visit.

### Pitfall 4: Lighthouse score measured without mobile throttling

**What goes wrong:** Desktop Lighthouse scores significantly higher than mobile. The PERF-5 requirement says "mobile profile."

**How to avoid:** Always run Lighthouse with `--preset=perf` and the default mobile emulation. Do not use `--form-factor=desktop`.

**Warning signs:** Score of 95+ on first run — likely desktop measurement.

---

## Code Examples

### In-memory aggregate helpers (for PERF-1 refactor)

These functions are pure and can be added to `db.js` as exports or inlined in `dashboard.js`:

```js
// Pure: compute weekly volume from pre-fetched array
function weeklyVolumeFrom(list) {
  const since = Date.now() - 7 * 86400000;
  return list.filter(w => w.timestamp >= since).reduce((s, w) => s + (w.tonnage || 0), 0);
}

// Pure: compute monthly volume from pre-fetched array
function monthlyVolumeFrom(list) {
  const since = Date.now() - 30 * 86400000;
  return list.filter(w => w.timestamp >= since).reduce((s, w) => s + (w.tonnage || 0), 0);
}

// Pure: compute monthly count from pre-fetched array
function monthlyCountFrom(list) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return list.filter(w => w.timestamp >= from).length;
}

// Pure: compute PPL tonnage from pre-fetched array
function pplTonnageFrom(list) {
  const r = { push: 0, pull: 0, legs: 0 };
  list.forEach(w => { if (r[w.type] !== undefined) r[w.type] += w.tonnage || 0; });
  return r;
}
```

### Dynamic Firebase SDK injection (for PERF-3)

```js
// In db-firebase.js, new helper before autoInit()
function _loadFirebaseSDK() {
  if (window.firebase) return Promise.resolve();
  const BASE = 'https://www.gstatic.com/firebasejs/10.12.0/';
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('[FirebaseDB] Failed to load: ' + src));
      document.head.appendChild(s);
    });
  }
  // Must be sequential: firestore depends on app
  return loadScript(BASE + 'firebase-app-compat.js')
    .then(() => loadScript(BASE + 'firebase-firestore-compat.js'));
}

// Modified autoInit()
async function autoInit() {
  if (_db) return _db;
  try {
    const res = await fetch('/api/firebase-config');
    const cfg = await res.json();
    if (!cfg.configured) {
      console.warn('[FirebaseDB] Not configured.');
      return null;
    }
    await _loadFirebaseSDK();  // only runs when configured === true
    return init(cfg);
  } catch (err) {
    console.error('[FirebaseDB] autoInit failed:', err.message);
    return null;
  }
}
```

### Lighthouse CLI run command

```bash
# Run after server is started on port 3000
npx lighthouse http://localhost:3000 \
  --output=json \
  --output-path=.planning/phases/02-performance-reliability/lighthouse-baseline.json \
  --only-categories=performance \
  --chrome-flags="--headless --no-sandbox"

# Read the score from the output
node -e "
  const r = require('./.planning/phases/02-performance-reliability/lighthouse-baseline.json');
  console.log('Performance score:', Math.round(r.categories.performance.score * 100));
"
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Multiple getAll() per screen load | Single getAll() + in-memory aggregates | Fewer IDB transactions, lower jank on low-end Android |
| Unconditional CDN scripts in `<head>` | Conditional dynamic injection | 100 KB not downloaded when Firebase unconfigured |
| All modules parsed at startup | Lazy import() on first screen visit | Lower TTI, faster initial render |
| Static precache list missing files | Complete ASSETS list in sw.js | Reliable offline mode for all screens |

---

## Open Questions

1. **Does autoInit() get called anywhere automatically at boot?**
   - What we know: Grep found `autoInit` only in `db-firebase.js` — it is exported but never called in `app.js` or any boot path.
   - What's unclear: Profile screen sync button — need to confirm it calls `FirebaseDB.autoInit()` so we know the lazy path is triggered correctly.
   - Recommendation: Treat as confirmed-not-called-at-boot. If profile.js calls autoInit(), the lazy SDK injection will work correctly since it's triggered by user action.

2. **Should claude.view.js be split to isolate renderFAB?**
   - What we know: `renderFAB()` is called at boot in `app.js` line 81 and must run before the user sees the UI. `claude.view.js` contains the 600-line SVG body builder which is heavy to parse.
   - What's unclear: How much parse time does claude.view.js add on a mid-range Android device?
   - Recommendation: For Phase 2, keep claude.view.js as a static import. The requirement says "do not initialize on app start — only on first screen visit." Initialization (Heatmap.compute()) is already deferred — it runs inside `open()`, not at module level. The module parse overhead is minor compared to the Firebase 100 KB network fetch.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in test runner (node:test) |
| Config file | none — run with `node --test` |
| Quick run command | `node --test test/smoke.test.js test/pwa.test.js` |
| Full suite command | `node --test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-1 | Dashboard.load() triggers 1 IDB transaction on workouts store | unit | `node --test test/perf.test.js` | Wave 0 |
| PERF-2 | Analytics/Claude modules not initialized before first Nav.go() | unit | `node --test test/perf.test.js` | Wave 0 |
| PERF-3 | Firebase CDN scripts not requested when configured=false | integration | `node --test test/smoke.test.js` (extend) | Partial — smoke.test.js covers /api/firebase-config |
| PERF-4 | All JS files present in sw.js ASSETS list | static analysis | `node --test test/pwa.test.js` (extend) | Partial — pwa.test.js covers sw.js structure |
| PERF-5 | Lighthouse mobile score ≥ 90 | e2e/manual | `npx lighthouse http://localhost:3000 ...` | Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test test/smoke.test.js test/pwa.test.js`
- **Per wave merge:** `node --test`
- **Phase gate:** Full suite green + Lighthouse ≥ 90 before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `test/perf.test.js` — covers PERF-1 (DB coalescing assertion), PERF-2 (module init guard check), PERF-3 (no Firebase scripts in HTML when unconfigured — static file check)
- [ ] Extend `test/pwa.test.js` — add PERF-4 assertion: verify all `js/*.js` file names appear in `sw.js` ASSETS

*(PERF-5 is manual-only: requires running Chrome, cannot be automated in `node --test` environment)*

---

## Sources

### Primary (HIGH confidence)
- Source code audit: `js/dashboard.js`, `js/db.js`, `js/app.js`, `js/shell.js`, `js/db-firebase.js`, `js/claude.store.js`, `js/analytics.store.js`, `index.html`, `sw.js` — all read directly
- `.planning/REQUIREMENTS.md` — PERF-1 through PERF-5 definitions
- `.planning/STATE.md` — confirmed PERF-4 was partially addressed in Phase 1 Plan 06
- `.planning/phases/01-architecture-foundation/01-06-PLAN.md` — confirmed sw.js update scope

### Secondary (MEDIUM confidence)
- Lighthouse CLI flags: standard usage, `--only-categories=performance`, `--chrome-flags="--headless"` are well-established

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all changes are within existing code
- Architecture: HIGH — exact current state confirmed by reading source files
- Pitfalls: HIGH — derived from actual code structure, not guesswork

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable domain — Vanilla JS, IndexedDB, Service Worker APIs do not change on short timelines)
