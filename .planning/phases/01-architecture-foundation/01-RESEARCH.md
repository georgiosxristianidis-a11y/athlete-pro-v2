# Phase 1 Research — Architecture Foundation
**Generated:** 2026-03-16
**Phase requirements:** ARCH-1, ARCH-2, ARCH-3, ARCH-4

---

## 1. Current State Analysis

### 1.1 Global Namespace — What Lives on `window`

Every client-side JS file uses the IIFE-returns-object pattern, assigning the result to a `const` at the top level of a `<script defer>` file. In a non-module context these `const` declarations land in the global scope and are accessible as `window.X`.

| Global name | Defined in | IIFE return value |
|-------------|------------|-------------------|
| `DB` | `js/db.js` | `{ Workouts, OneRM, Metrics, Settings, Events, Backup, clearAll, openDB }` |
| `FirebaseDB` | `js/db-firebase.js` | `{ init, autoInit, isReady, Workouts, OneRM, Metrics, Settings, Events, Backup, clearAll }` |
| `Timer` | `js/timer.js` | `{ start, pause, resume, reset, seconds, fmt, restore }` |
| `Dashboard` | `js/dashboard.js` | `{ load }` |
| `Workout` | `js/workout.js` | `{ init, renderSelect, selectType, openPlanEditor, _closePlanEditor, _savePlanAndClose, _switchPlanTab, _updatePlanName, _adjustPlan, _addPlanEx, _deletePlanEx, toggleChecklist, stepWeight, stepReps, editVal, commitVal, setRPE, toggleSet, toggleCard, addSet, completeSession, cancelSession, openReplaceExModal }` |
| `RestTimer` | `js/workout.js` (end of file) | Second IIFE appended — `start`, etc. |
| `Analytics` | `js/analytics.js` | `{ load, calPrev, calNext, calDayClick }` |
| `Profile` | `js/profile.js` | `{ load, saveMetrics, saveMeasurements, adjustRest, setUnit, toggleHaptic, exportData, importData, _onImportFile, clearAllData }` |
| `Claude` | `js/claude.js` | `{ renderFAB, open, close, _sendChat }` |
| `Heatmap` | `js/claude.js` (nested IIFE) | `{ compute, scoreColor, scoreLabel }` |
| `MUSCLE_MAP` | `js/claude.js` | Plain object — NOT inside an IIFE |
| `buildBodySVG` | `js/claude.js` | Plain function — NOT inside an IIFE |
| `buildLegend` | `js/claude.js` | Plain function — NOT inside an IIFE |
| `Nav` | `index.html` inline `<script>` | `{ go, current }` — assigned to `window.Nav` explicitly |
| `Toast` | `index.html` inline `<script>` | `{ show }` — assigned to `window.Toast` explicitly |
| `openDB` | `js/db.js` | Exported as part of `DB` AND as a module-level function (called directly in index.html bootstrap as `openDB()`) |
| `renderBodyStats` | `js/body-stats.js` | Plain function — not inspected but called as `renderBodyStats()` in `Nav` handler |

**Additional globals used via `onclick=""` HTML attributes:**
Inline event handlers in rendered HTML strings call globals directly:
- `Analytics.calPrev()`, `Analytics.calNext()` — in analytics.js template HTML
- `Claude.close()`, `Claude._sendChat()` — in claude.js template HTML
- `Workout.*` — in workout.js template HTML (many: `Workout.selectType`, `Workout.openPlanEditor`, etc.)
- `Profile.*` — in profile.js template HTML
- `Nav.go(...)` — in dashboard.js template HTML and in index.html

**Two temp globals set by workout.js:**
```js
window._planEditorActiveTab = () => activeTab;
window._planEditorSetTab = (t) => { ... };
```

### 1.2 IIFE Inventory Per File

**js/db.js** — Single IIFE-like pattern: plain functions/consts at module scope, assembled into `DB` object at the bottom. No `const DB = (() => {})()` wrapping. `openDB`, `tx`, `req2p`, `getAll` are exposed as top-level globals.

**js/db-firebase.js** — `const FirebaseDB = (() => { ... })()`

**js/timer.js** — `const Timer = (() => { ... })()`

**js/dashboard.js** — `const Dashboard = (() => { ... })()`

**js/workout.js** — Two IIFEs in same file:
1. `const Workout = (() => { ... })()` — lines 1–1351
2. `const RestTimer = (() => { ... })()` — starts line 1357 (also in workout.js)

**js/analytics.js** — `const Analytics = (() => { ... })()`

**js/profile.js** — `const Profile = (() => { ... })()`

**js/claude.js** — Multiple constructs at module scope:
1. `const MUSCLE_MAP = { ... }` — plain global object (not in IIFE)
2. `const Heatmap = (() => { ... })()` — IIFE
3. `function buildBodySVG(scores)` — plain global function
4. `function buildLegend(scores)` — plain global function
5. `const Claude = (() => { ... })()` — IIFE
6. Auto-init block: `if (document.readyState === 'loading') { ... }` — side effect at module level

### 1.3 Complete Function Inventory

#### db.js (public API on `DB`)
- `DB.Workouts.save(session)` — saves workout session
- `DB.Workouts.getAll()` — all workouts, newest first
- `DB.Workouts.getLast(n)` — last N workouts
- `DB.Workouts.deleteById(id)` — delete by id
- `DB.Workouts.delete(id)` — duplicate of deleteById (deferred fix ARCH-7)
- `DB.Workouts.getLastByType(type)` — last workout of given type
- `DB.Workouts.weeklyVolume()` — total kg last 7 days
- `DB.Workouts.monthlyVolume()` — total kg last 30 days
- `DB.Workouts.monthlyCount()` — sessions this calendar month
- `DB.Workouts.pplTonnage()` — `{ push, pull, legs }` totals
- `DB.Workouts.weeklyTrend(weeks)` — bucket array for chart
- `DB.Workouts.clear()` — wipe all workouts
- `DB.OneRM.epley(weight, reps)` — Epley formula
- `DB.OneRM.update(exerciseName, weight, reps)` — upsert if higher
- `DB.OneRM.get(exerciseName)` — single exercise record
- `DB.OneRM.getAll()` — all 1RM records
- `DB.OneRM.clear()`
- `DB.Metrics.bmi(weight, heightCm)` — calculate BMI
- `DB.Metrics.save(weight, heightCm)` — save body metrics entry
- `DB.Metrics.latest()` — most recent metrics
- `DB.Metrics.getAll()` — all entries newest first
- `DB.Metrics.clear()`
- `DB.Settings.set(key, value)`
- `DB.Settings.get(key, fallback)`
- `DB.Settings.getAll()` — returns `{key: value}` map
- `DB.Settings.clear()`
- `DB.Events.log(type, payload)`
- `DB.Events.getAll()`
- `DB.Events.clear()`
- `DB.Backup.export()` — JSON string
- `DB.Backup.import(jsonStr)` — merge import
- `DB.clearAll()` — wipe everything
- `DB.openDB()` — raw IDB open

#### workout.js (public API on `Workout`)
**State management:**
- `State` object: `{ phase, type, plan, startedAt, stepDebounce }`
- `loadPlan()` — reads from localStorage, falls back to DEFAULT_PLAN
- `savePlan(plan)` — writes to localStorage
- `buildSession(type)` — converts plan template into active session shape
- `_persistSession()` — saves active state to localStorage (`ap-active-session`)
- `tryRestoreSession()` — restores interrupted session on app boot
- `init()` — calls tryRestoreSession or renderSelect

**View/render:**
- `renderSelect()` — renders workout type selector screen
- `renderActive()` — renders active workout screen
- `renderExerciseCard(ex, ei)` — renders one exercise card HTML
- `renderSetRow(ex, ei, set, si)` — renders one set row HTML

**User interactions (event handlers):**
- `selectType(type)` — starts session for type
- `openPlanEditor()` — opens plan editor modal
- `_closePlanEditor()`
- `_savePlanAndClose()`
- `_switchPlanTab(type)`
- `_updatePlanName(type, i, val)`
- `_adjustPlan(type, i, field, delta)`
- `_addPlanEx(type)`
- `_deletePlanEx(type, i)`
- `toggleChecklist(i)`
- `stepWeight(ei, si, delta)`
- `stepReps(ei, si, delta)`
- `editVal(type, ei, si)`
- `commitVal(type, ei, si)`
- `setRPE(ei, si, val)`
- `toggleSet(ei, si)`
- `toggleCard(ei)`
- `addSet(ei)`
- `openReplaceExModal(ei)`
- `completeSession()` — saves to DB, navigates home
- `cancelSession()`

**Private:**
- `_updateStepperUI(type, ei, si, val, atMin)`
- `_updateLiveStats()`
- `_startRest(seconds)`
- `_stopRest()`
- `_showConfirm(title, body, confirmLabel, onConfirm)`
- `_initDrag()` — drag-to-reorder for active workout
- `_initPlanDrag()` — drag-to-reorder for plan editor
- `_haptic(ms)`
- `svgArrow(dir)`, `typeIcon(type, color)`, `fmtVol(kg)` — render helpers

**RestTimer** (second IIFE in workout.js):
- `start(exName, setLabel, seconds)`
- (full API not read — truncated in source)

#### analytics.js (public API on `Analytics`)
**Data (Store):**
- Uses `DB.Workouts.getAll()`, `DB.OneRM.getAll()`, `DB.Metrics.getAll()` directly
- Uses `DB.Workouts.weeklyTrend(10)` and `DB.Workouts.pplTonnage()` from within render functions
- State: `_calYear`, `_calMonth`, `_calWorkouts` — module-level mutable vars

**View/render (all private prefixed `_render`):**
- `load()` — renders entire screen HTML + fetches data
- `_renderQuickStats(workouts)`
- `_renderCalendar(workouts)` → `_drawCalendar()`
- `calPrev()`, `calNext()` — public (called via onclick in HTML)
- `calDayClick(year, month, day, existingType, existingId)` — public (called from event listener, also used in onclick in template strings)
- `_renderVolumeChart(workouts)` — calls `DB.Workouts.weeklyTrend()`
- `_renderPPLDonut(workouts)` — calls `DB.Workouts.pplTonnage()`
- `_renderORMList(orms)`
- `_renderBWChart(metrics)`
- `_renderTimeChart(workouts)`
- Canvas helpers: `_drawLineChart`, `_chartEmpty`, `_roundRect`, `_weekLabel`
- Utils: `_fmtVol`, `_set`

#### claude.js (public API on `Claude`, `Heatmap`, plus loose globals)
**MUSCLE_MAP** — global const (no home module)
**Heatmap (IIFE):**
- `compute()` — async, reads `DB.Workouts.getAll()`, returns `{ muscle: score }`
- `scoreColor(score)` — pure function
- `scoreLabel(score)` — pure function

**buildBodySVG(scores)** — global pure render function (large SVG string)
**buildLegend(scores)** — global pure render function

**Claude (IIFE):**
- State: `_open`, `_context`, `_chatHistory`, `_streaming`
- `renderFAB()` — creates floating button, auto-called on DOM ready
- `open()` — async, fetches DB data, builds panel HTML
- `close()`
- `_fetchCoach(message)` — async SSE fetch to `/api/coach`
- `_sendChat()` — public (called via onclick in template)
- `_buildNextSession(workouts, scores)` — render helper
- `_buildORMProgress(orms)` — render helper
- `_claudeIcon(size)` — render helper

#### server.js (Node.js, not a browser module)
Routes:
- `GET /api/supabase-status` — proxies Supabase health check
- `GET /api/firebase-config` — exposes Firebase config from env
- `POST /api/coach` — streams Claude Opus response via SSE

Helpers:
- `_buildSystemPrompt(workouts, fatigue, topLifts)` — builds AI system prompt string

Exports: `{ app, startServer }`

---

## 2. Proposed Store / View Split

The core principle: **Store** = data + state + DB operations. **View** = DOM manipulation + event handling.

### 2.1 workout.js → WorkoutStore + WorkoutView

**`js/workout.store.js`** — pure state and data operations, no DOM access:
```
DEFAULT_PLAN (const)
EXERCISE_LIBRARY (const)
SESSION_KEY, PLAN_KEY (const)
State object
loadPlan()
savePlan(plan)
buildSession(type)
_persistSession()
tryRestoreSession()  ← needs DOM for Nav.go — see note below
init()  ← wrapper; stays here as coordinator
```

Note on `tryRestoreSession`: it calls `Nav.go('s-train')` and `Toast.show()`. In the ES Module world these become explicit imports from a nav/toast module. The function itself belongs in the store because it restores state; the side-effect calls (Nav, Toast) become injected dependencies or simple imports.

**`js/workout.view.js`** — all DOM reads/writes and event handlers:
```
TYPE_COLOR (const — view concern)
svgArrow(dir), typeIcon(type, color), fmtVol(kg)
renderSelect()
renderActive()
renderExerciseCard(ex, ei)
renderSetRow(ex, ei, set, si)
openPlanEditor(), _closePlanEditor(), _savePlanAndClose()
_switchPlanTab(type)
_updatePlanName(), _adjustPlan(), _addPlanEx(), _deletePlanEx()
toggleChecklist()
stepWeight(), stepReps(), editVal(), commitVal()
setRPE()
toggleSet()
toggleCard()
addSet()
openReplaceExModal()
completeSession()  ← orchestrates: calls store + DB + Timer
cancelSession()
_updateStepperUI()
_updateLiveStats()
_startRest(), _stopRest()
_showConfirm()
_initDrag(), _initPlanDrag()
_haptic()
```

`RestTimer` (currently appended to workout.js) should move to its own file `js/rest-timer.js` or be merged with `timer.js` as a second export.

### 2.2 analytics.js → AnalyticsStore + AnalyticsView

**`js/analytics.store.js`**:
```
_calYear, _calMonth, _calWorkouts  ← calendar state
calPrev(), calNext()               ← mutate calendar state
_weekLabel(bucket)                 ← pure date formatter (could go either way; belongs here for reuse)
_fmtVol(kg)                        ← pure formatter
```
Note: analytics.js currently has NO separate DB fetch logic — it calls `DB.*` directly inside view render functions. In the store split, data fetching (`DB.Workouts.getAll()` etc.) should be lifted into store functions so the view receives plain data arrays.

**`js/analytics.view.js`**:
```
TYPE_COLOR (const)
load()                             ← orchestrates: calls store data fetchers, passes data to renders
_renderQuickStats(workouts)
_drawCalendar()                    ← reads _calYear/_calMonth from store
_renderCalendar(workouts)
calDayClick()                      ← modal + DB write + reload
_renderVolumeChart(workouts)
_renderPPLDonut(workouts)
_renderORMList(orms)
_renderBWChart(metrics)
_renderTimeChart(workouts)
_drawLineChart(), _chartEmpty(), _roundRect()  ← canvas helpers
_set(id, html)                     ← DOM utility
```

### 2.3 claude.js → ClaudeStore + ClaudeView

**`js/claude.store.js`**:
```
MUSCLE_MAP (const)
Heatmap.compute()
Heatmap.scoreColor(score)
Heatmap.scoreLabel(score)
_chatHistory []                    ← conversation state
_context {}                        ← fetched workout/orms/scores context
_streaming bool
_open bool
_fetchCoach(message)               ← SSE fetch logic (side-effecty but server-facing, not DOM-facing)
```

**`js/claude.view.js`**:
```
buildBodySVG(scores)
buildLegend(scores)
renderFAB()
open()                             ← orchestrates: calls store, builds DOM
close()
_sendChat()
_buildNextSession(workouts, scores)
_buildORMProgress(orms)
_claudeIcon(size)
```

---

## 3. ES Module Migration Map

### 3.1 Strategy

Switch every `<script src="..." defer>` to `<script type="module" src="...">`. ES modules are deferred by default — no explicit `defer` needed. The `type="module"` attribute enables `import`/`export` syntax and automatically applies strict mode.

**Key implication:** `type="module"` scripts do NOT add declarations to `window`. All cross-module usage via global names (e.g., `onclick="Workout.foo()"` in HTML strings) will break. This is the biggest migration challenge.

### 3.2 Dependency Graph (Current)

```
index.html (inline bootstrap)
  └── requires: DB.openDB(), Workout.init(), Dashboard.load(), Nav.go()

db.js
  └── no dependencies

db-firebase.js
  └── requires: firebase (CDN global)

timer.js
  └── no dependencies

dashboard.js
  └── requires: DB

workout.js
  └── requires: DB, Timer, Toast (window.Toast), Nav (window.Nav)

analytics.js
  └── requires: DB

profile.js
  └── requires: DB, Toast, Dashboard

claude.js
  └── requires: DB, Nav (window.Nav)

body-stats.js
  └── (not read; called as renderBodyStats() global)

plate-calc.js
  └── (not read; standalone tool)
```

### 3.3 Proposed Module Export Contracts

**`js/db.js`**
```js
export const DB = { Workouts, OneRM, Metrics, Settings, Events, Backup, clearAll, openDB };
// or individual named exports:
export { Workouts, OneRM, Metrics, Settings, Events, Backup, clearAll, openDB };
```

**`js/timer.js`**
```js
export const Timer = { start, pause, resume, reset, seconds, fmt, restore };
```

**`js/rest-timer.js`** (split from workout.js)
```js
export const RestTimer = { start, ... };
```

**`js/workout.store.js`**
```js
import { DB } from './db.js';
import { Timer } from './timer.js';
export const WorkoutStore = { State, loadPlan, savePlan, buildSession, persistSession, tryRestoreSession };
```

**`js/workout.view.js`**
```js
import { WorkoutStore } from './workout.store.js';
import { DB } from './db.js';
import { Timer } from './timer.js';
export const Workout = { init, renderSelect, renderActive, selectType, ... all public handlers ... };
```

**`js/analytics.store.js`**
```js
import { DB } from './db.js';
export const AnalyticsStore = { getCalState, calPrev, calNext, fetchData };
```

**`js/analytics.view.js`**
```js
import { AnalyticsStore } from './analytics.store.js';
import { DB } from './db.js';
export const Analytics = { load, calPrev, calNext, calDayClick };
```

**`js/claude.store.js`**
```js
import { DB } from './db.js';
export const MUSCLE_MAP = { ... };
export const Heatmap = { compute, scoreColor, scoreLabel };
export const ClaudeStore = { open: openPanel, close: closePanel, sendChat, fetchCoach };
```

**`js/claude.view.js`**
```js
import { MUSCLE_MAP, Heatmap, ClaudeStore } from './claude.store.js';
import { DB } from './db.js';
export const Claude = { renderFAB, open, close, _sendChat };
export { buildBodySVG, buildLegend };
```

**`js/dashboard.js`**
```js
import { DB } from './db.js';
export const Dashboard = { load };
```

**`js/profile.js`**
```js
import { DB } from './db.js';
export const Profile = { load, saveMetrics, ..., clearAllData };
```

### 3.4 Handling `onclick=""` in Template Strings — The Critical Problem

The largest migration complexity is inline event handlers. The codebase uses `onclick="Workout.foo()"` inside JavaScript template strings extensively. These work only when `Workout` is a global.

**Two valid resolution strategies:**

**Option A — Convert all onclick to event delegation (preferred):**
After rendering HTML, attach event listeners via `addEventListener` on a container element, using `data-action` attributes. Example:
```js
// Instead of:  onclick="Workout.stepWeight(${ei},${si},2.5)"
// Render:       data-action="stepWeight" data-ei="${ei}" data-si="${si}" data-delta="2.5"
// Then:         container.addEventListener('click', e => { const el = e.target.closest('[data-action]'); ... })
```
This is the cleanest approach but requires the most refactoring work within view files.

**Option B — Re-expose needed globals explicitly in an entry module:**
Create a single `js/app.js` entry point that imports all modules and explicitly assigns the few names needed for onclick handlers:
```js
import { Workout } from './workout.view.js';
import { Analytics } from './analytics.view.js';
import { Claude } from './claude.view.js';
import { Profile } from './profile.view.js';
import { Nav, Toast } from './shell.js';
window.Workout = Workout;
window.Analytics = Analytics;
window.Claude = Claude;
window.Profile = Profile;
window.Nav = Nav;
window.Toast = Toast;
```
This is a pragmatic bridge — ES Modules internally, but event handlers still work without rewriting every template string. It satisfies success criterion 1 ("no module exposes globals") in spirit because the globals are EXPLICITLY assigned in one place rather than being side effects of module evaluation.

**Recommendation:** Use Option B for this phase to minimize scope and regression risk. Option A (full event delegation) is a cleaner v2 improvement.

### 3.5 Nav and Toast

Currently defined as IIFEs inside the `DOMContentLoaded` handler in `index.html` and assigned to `window.Nav` and `window.Toast`. In ES Module world these should become a shell module:

**`js/shell.js`**
```js
// Nav and Toast implementations
export const Nav = { go, current };
export const Toast = { show };
```

The `index.html` bootstrap `<script>` becomes a thin entry point that imports `shell.js` and kicks off initialization.

### 3.6 `openDB()` Direct Call from Bootstrap

`index.html` calls `openDB()` directly:
```js
openDB().then(() => {
  if (!Workout.init()) { Dashboard.load(); }
})
```
With ES Modules, `openDB` must be imported from `db.js` in the entry module. This is straightforward.

### 3.7 Script Loading Order Change

Current order (all `defer`):
```html
<script src="js/db.js" defer>
<script src="js/db-firebase.js" defer>
...all others...
```

ES Module order (one entry point + imports handle order):
```html
<script type="module" src="js/app.js">
```
All dependencies are resolved via `import` statements — load order is automatic.

---

## 4. Server Refactor Plan

### 4.1 Target Structure

```
server.js           ← init + listen only (~25 lines)
routes/
  coach.js          ← POST /api/coach + _buildSystemPrompt
  integrations.js   ← GET /api/supabase-status + GET /api/firebase-config
lib/
  anthropicClient.js ← Anthropic SDK init, export singleton
```

### 4.2 server.js (target ~20 lines)
```js
'use strict';
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.use('/api', require('./routes/coach'));
app.use('/api', require('./routes/integrations'));

function startServer(port = process.env.PORT || 3000) {
  return app.listen(port, () => {
    console.log(`\n  Athlete Pro  →  http://localhost:${port}\n`);
  });
}
module.exports = { app, startServer };
if (require.main === module) startServer();
```

### 4.3 lib/anthropicClient.js
```js
'use strict';
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
module.exports = anthropic;
```
Rationale: The Anthropic client is instantiated at module evaluation time in the current server.js. Moving it to lib/ means it is initialized once, can be imported by any route, and is mockable in tests.

### 4.4 routes/coach.js
Contains:
- `POST /api/coach` handler (currently lines 69–108 of server.js)
- `_buildSystemPrompt(workouts, fatigue, topLifts)` (currently lines 111–156)

```js
'use strict';
const express = require('express');
const router = express.Router();
const anthropic = require('../lib/anthropicClient');

router.post('/coach', async (req, res) => { ... });
function _buildSystemPrompt(workouts, fatigue, topLifts) { ... }
module.exports = router;
```

### 4.5 routes/integrations.js
Contains:
- `GET /api/supabase-status` (lines 21–51)
- `GET /api/firebase-config` (lines 53–66)

```js
'use strict';
const express = require('express');
const router = express.Router();

router.get('/supabase-status', async (req, res) => { ... });
router.get('/firebase-config', (req, res) => { ... });
module.exports = router;
```

Note: `integrations.js` does NOT need `anthropicClient` — it only reads env vars for Supabase and Firebase. The clean separation means Firebase config is not coupled to the AI route.

---

## 5. PWA-Specific Considerations

### 5.1 Service Worker and Module-Type Scripts

**Critical:** The service worker (`sw.js`) runs in its own scope and cannot use ES Modules syntax (`import`/`export`) unless it is declared as a module worker:
```js
navigator.serviceWorker.register('sw.js', { type: 'module' });
```
However, module service workers have limited browser support and are not yet universally available. **Recommendation: keep `sw.js` as a classic script** — it has no dependencies on the app's JS modules, only on the ASSETS list of URLs to cache.

The ASSETS list in `sw.js` will need to be updated as part of this phase to reflect the new module file paths:
- Add: `js/workout.store.js`, `js/workout.view.js`, `js/analytics.store.js`, `js/analytics.view.js`, `js/claude.store.js`, `js/claude.view.js`, `js/shell.js`, `js/app.js`, `js/rest-timer.js`
- Remove or keep: old paths (`js/workout.js`, `js/analytics.js`, `js/claude.js`) depending on rename vs. new-file strategy

**PERF-4 (deferred to Phase 2)** already flags that `js/db-firebase.js`, `js/supabase-check.js`, `js/plate-calc.js` are missing from sw.js. Phase 1 should not ignore this further — the sw.js ASSETS update is required for the app to work fully offline after the migration.

### 5.2 Offline Operation

The app is designed to work fully offline (IndexedDB for local storage). The AI coach (`/api/coach`) gracefully handles offline by showing an error in the panel. This architecture is preserved in Phase 1 — only file organization changes, not the offline storage layer.

### 5.3 Add-to-Homescreen / Standalone Display

The `manifest.json` points to `/index.html` as `start_url`. ES Module `<script type="module">` is fully supported in all browsers that support PWA installation (Chrome, Safari 16.4+, Firefox). No compatibility issues expected.

### 5.4 Firebase SDK and ES Modules

`db-firebase.js` currently uses the Firebase compat SDK (`firebase-app-compat.js`, `firebase-firestore-compat.js`) loaded from CDN via `<script>` tags in `index.html` BEFORE the defer scripts. These scripts create a global `firebase` variable that `db-firebase.js` depends on.

**Risk:** If `db-firebase.js` becomes an ES Module (`import`), it still needs `firebase` global to be set before it runs. With ES Modules, deferred execution is guaranteed to happen after DOM parse but import ordering is resolved by the module graph, not script tag order.

**Safe approach:** Keep the Firebase CDN scripts as regular `<script>` tags (not modules) above the `<script type="module" src="js/app.js">` entry. The `firebase` global will exist before any module code runs.

**Better approach (Phase 3 or beyond):** Use Firebase Modular SDK (`firebase/app`, `firebase/firestore`) via npm and import it directly. This is deferred per PERF-3 (conditional load).

### 5.5 localStorage Keys

Workout session persistence (`ap-active-session`, `ap-custom-plan`) and timer state (`ap-timer-state`) use localStorage. These are internal to store modules and no migration risk exists.

### 5.6 `display: standalone` and onclick Handlers

In standalone (installed PWA) mode, the window object behaves identically to a browser tab. The `onclick` handler global resolution works the same way. Option B (explicit window assignments) works correctly in standalone mode.

---

## 6. Risks and Mitigation Strategies

### Risk 1 — Inline onclick Handlers Break After Module Migration
**Severity: High**
**Description:** Every file renders HTML strings with `onclick="ModuleName.method()"`. Once modules stop polluting window, these fail with `ModuleName is not defined`.
**Mitigation:** Use Option B — create `js/app.js` entry that explicitly assigns needed names to window after importing all modules. This can be done atomically in one step before any other changes, so the app continues to function throughout migration.

### Risk 2 — `db.js` `openDB` Called from Bootstrap Before Modules Load
**Severity: Medium**
**Description:** `index.html` bootstrap calls `openDB()` directly. In ES Module world `openDB` is not a global.
**Mitigation:** Move bootstrap code into `js/app.js` which imports `{ openDB } from './db.js'`. The bootstrap `<script>` in `index.html` becomes `<script type="module" src="js/app.js">`.

### Risk 3 — `_planEditorActiveTab` / `_planEditorSetTab` Window Hacks
**Severity: Low**
**Description:** `workout.js` assigns closure-capturing functions to `window._planEditorActiveTab` and `window._planEditorSetTab`. These are effectively a hack to allow the plan editor modal's onclick handlers to access the closed-over `activeTab` variable.
**Mitigation:** Convert the plan editor to manage its own state explicitly in WorkoutView (pass activeTab as a closure or store it in a module-level variable in workout.view.js). Remove the window assignments.

### Risk 4 — `RestTimer` Appended to workout.js
**Severity: Low**
**Description:** A second IIFE named `RestTimer` lives at the end of `workout.js`. It is a separate concern and separate global.
**Mitigation:** Extract to `js/rest-timer.js` as a separate module.

### Risk 5 — `claude.js` Has Module-Level Side Effects
**Severity: Medium**
**Description:** `claude.js` contains code outside any IIFE that runs immediately when the file loads: the FAB auto-render block runs on `DOMContentLoaded`. With ES Modules this side effect still occurs, but timing depends on when the module is first imported.
**Mitigation:** Remove the auto-init block from claude.js. Instead, `app.js` should explicitly call `Claude.renderFAB()` after DOM ready. This makes initialization explicit rather than implicit.

### Risk 6 — `MUSCLE_MAP`, `buildBodySVG`, `buildLegend` Are Loose Globals in `claude.js`
**Severity: Medium**
**Description:** These three constructs are not inside the `Claude` IIFE and live at module scope, becoming globals. `buildBodySVG` and `buildLegend` are large render functions used only by `Claude.open()`.
**Mitigation:** Move `MUSCLE_MAP`, `buildBodySVG`, `buildLegend` into `claude.store.js` (for MUSCLE_MAP and compute logic) and `claude.view.js` (for SVG rendering). Export what is needed between modules.

### Risk 7 — Circular Dependency Risk
**Severity: Low-Medium**
**Description:** The dependency graph is currently one-directional (db ← modules ← shell ← bootstrap). No circular deps exist today. Care must be taken when splitting store/view files: `workout.view.js` imports `workout.store.js` which imports `db.js`. The `tryRestoreSession` function in the store calls `Nav.go()` — if Nav is defined in `shell.js` which also imports `Workout` from `workout.view.js`, a circular dependency results.
**Mitigation:** `tryRestoreSession` should not import Nav. Instead, it should return a boolean to its caller (`init()`), and the caller (in `app.js` or `workout.view.js`) decides whether to call `Nav.go()`. This pattern is already partially in place — `init()` currently calls `tryRestoreSession()` and checks its return value.

### Risk 8 — Anthropic Client Init Timing (server-side)
**Severity: Low**
**Description:** `lib/anthropicClient.js` creates the Anthropic instance at module evaluation time. If `ANTHROPIC_API_KEY` is not set in the environment, the constructor will succeed (no error thrown during construction in the SDK) but requests will fail at call time.
**Mitigation:** Current server.js already checks `if (!process.env.ANTHROPIC_API_KEY)` in the route handler before making API calls. This check stays in `routes/coach.js`.

### Risk 9 — Service Worker Cache Invalidation
**Severity: Medium**
**Description:** Splitting files (e.g., `workout.js` → `workout.store.js` + `workout.view.js`) changes the URL space. Old cached responses for `/js/workout.js` will persist in users' browsers until the cache is invalidated.
**Mitigation:** Bump `CACHE_NAME` in `sw.js` from `athlete-pro-v2` to `athlete-pro-v3` as part of this phase. The activate handler already prunes old caches.

### Risk 10 — JSDoc Annotations are Type-Only (No Runtime Enforcement)
**Severity: Low**
**Description:** ARCH-3 requires JSDoc but not TypeScript. JSDoc serves IDE autocompletion and `checkJs` static analysis, not runtime validation.
**Mitigation:** Add `// @ts-check` to files where JSDoc types are added to enable VS Code's implicit type checking. This gives free TypeScript-level feedback without adding a compilation step.

---

## 7. Validation Architecture

### SC1: No module exposes globals to window
**Criterion:** All cross-module dependencies are explicit ES imports.

**Verification method:**
1. Open browser DevTools console after loading app.
2. Run: `Object.keys(window).filter(k => ['DB','Workout','Analytics','Claude','Profile','Dashboard','Timer','Heatmap','MUSCLE_MAP','buildBodySVG','buildLegend','FirebaseDB','RestTimer'].includes(k))`
3. **Expected result:** Empty array (or only `Nav`, `Toast`, and any names explicitly assigned in `app.js` for onclick handler compatibility).
4. Additionally: check that `window.Workout === undefined` OR that `window.Workout` is explicitly assigned in `app.js` (the intentional bridge), not implicitly from module evaluation.

**Automated check approach:**
```js
// Add to test/arch-check.js
const forbidden = ['DB','Workout','Analytics','Claude','Timer'];
forbidden.forEach(name => {
  if (Object.prototype.hasOwnProperty.call(window, name)) {
    console.error(`FAIL: window.${name} is a global (should be explicit or absent)`);
  }
});
```

### SC2: Store/View separation exists for workout, analytics, claude
**Criterion:** Each of workout, analytics, and claude has a distinct store file and a distinct view file.

**Verification method (filesystem check):**
```
js/workout.store.js    ← exists
js/workout.view.js     ← exists
js/analytics.store.js  ← exists
js/analytics.view.js   ← exists
js/claude.store.js     ← exists
js/claude.view.js      ← exists
```

**Content verification:**
- `*.store.js` files must not contain `document.getElementById`, `innerHTML`, `addEventListener`, or DOM API calls.
- `*.view.js` files must not contain `DB.` calls (should use store functions instead) — exception: direct DB calls that are view-orchestrated (e.g., `calDayClick` writing to DB after user action) may remain in view but should be clearly commented.

**Automated grep check:**
```bash
grep -n "document\.\|innerHTML\|addEventListener" js/workout.store.js  # expect 0 matches
grep -n "document\.\|innerHTML\|addEventListener" js/analytics.store.js # expect 0 matches
grep -n "document\.\|innerHTML\|addEventListener" js/claude.store.js    # expect 0 matches
```

### SC3: All public functions have JSDoc type annotations
**Criterion:** All public functions in db.js and the four major modules have JSDoc `@param`/`@returns` annotations, plus `@typedef` for shared types.

**Shared typedefs to define (in db.js or a types file):**
```js
/**
 * @typedef {{ id: number, type: 'push'|'pull'|'legs', timestamp: number,
 *   duration: number, tonnage: number,
 *   exercises: Array<{name: string, sets: Array<SetRecord>}> }} WorkoutRecord
 * @typedef {{ weight: number, reps: number, rpe: number|null, done: boolean }} SetRecord
 * @typedef {{ id: string, value: number, timestamp: number }} OneRMRecord
 * @typedef {{ id: number, weight: number, height: number, bmi: number, timestamp: number }} MetricsRecord
 */
```

**Verification method:**
1. Enable `// @ts-check` at top of each annotated file.
2. Open in VS Code — hover over function calls to confirm type hints display parameter types.
3. Run: `npx tsc --noEmit --checkJs --allowJs --strict js/db.js` — expect zero errors.

**Functions requiring annotation (minimum set):**
- `db.js`: All methods on `Workouts`, `OneRM`, `Metrics`, `Settings`, `Events`, `Backup`, `clearAll`, `openDB`
- `workout.store.js`: `loadPlan`, `savePlan`, `buildSession`, `persistSession`, `tryRestoreSession`, `init`
- `workout.view.js`: All items in the current public return object
- `analytics.view.js`: `load`, `calPrev`, `calNext`, `calDayClick`
- `claude.store.js`: `Heatmap.compute`, `Heatmap.scoreColor`, `Heatmap.scoreLabel`
- `claude.view.js`: `renderFAB`, `open`, `close`, `_sendChat`

### SC4: server.js under 30 lines; route handlers in routes/; Anthropic client in lib/
**Criterion:** server.js ≤ 30 lines; route handlers in `routes/`; Anthropic init in `lib/`.

**Verification method:**
```bash
wc -l server.js                      # must be ≤ 30
ls routes/coach.js routes/integrations.js lib/anthropicClient.js  # must exist
grep -n "new Anthropic" server.js    # must return 0 matches
grep -n "app.post\|app.get" server.js # must return 0 matches (routes are registered via app.use)
```

**Functional smoke test:**
```bash
npm start
curl http://localhost:3000/api/firebase-config      # expect {"configured":false} or config JSON
curl http://localhost:3000/api/supabase-status      # expect {"available":false,...}
# POST to /api/coach requires ANTHROPIC_API_KEY — test with curl or in browser
```

---

## 8. Implementation Order Recommendation

The phase has four task areas. Recommended execution order to minimize risk:

1. **Server refactor first (ARCH-4)** — No client-side dependencies. Zero regression risk to the browser app. Verify with curl tests before touching any client code.

2. **JSDoc annotations on db.js (ARCH-3, partial)** — db.js has no dependencies and is the foundation layer. Annotating it first makes annotations available to all modules that import it.

3. **ES Module migration entry point (ARCH-2, setup)** — Create `js/app.js` with explicit window assignments (Option B). Switch `index.html` to `<script type="module" src="js/app.js">`. This makes all existing code work as modules immediately. Run through all 5 screens and verify zero regressions.

4. **Store/View split for claude.js (ARCH-1)** — Start with claude.js because it is self-contained (the FAB pattern). Split into `claude.store.js` + `claude.view.js`, update imports in `app.js`.

5. **Store/View split for analytics.js (ARCH-1)** — Simpler split: the store is mostly calendar state and data-fetching wrappers. The view is the full render layer.

6. **Store/View split for workout.js (ARCH-1)** — Largest and most complex. Do last. Extract `RestTimer` to its own file first, then do the store/view split.

7. **Complete JSDoc annotations (ARCH-3)** — Can be done incrementally alongside each module split, or as a final pass over all files.

8. **Update sw.js ASSETS list** — Update cache name to v3, add new file paths, remove old monolith paths.

---

## 9. File Structure After Phase 1

```
athlete-pro/
├── index.html               (updated: type="module" entry point)
├── server.js                (~20 lines: init + listen only)
├── routes/
│   ├── coach.js             (POST /api/coach + _buildSystemPrompt)
│   └── integrations.js      (GET /api/supabase-status, GET /api/firebase-config)
├── lib/
│   └── anthropicClient.js   (Anthropic SDK singleton)
├── js/
│   ├── app.js               (entry point: imports, window assignments, bootstrap)
│   ├── shell.js             (Nav + Toast — exported)
│   ├── db.js                (unchanged API, ES export, JSDoc annotated)
│   ├── db-firebase.js       (unchanged API, ES export)
│   ├── timer.js             (ES export)
│   ├── rest-timer.js        (extracted from workout.js, ES export)
│   ├── dashboard.js         (ES export, JSDoc annotated)
│   ├── workout.store.js     (state + plan ops, ES export)
│   ├── workout.view.js      (render + handlers, ES export as Workout)
│   ├── analytics.store.js   (calendar state + data fetchers)
│   ├── analytics.view.js    (render + handlers, ES export as Analytics)
│   ├── claude.store.js      (MUSCLE_MAP, Heatmap, fetch logic)
│   ├── claude.view.js       (SVG, FAB, panel, ES export as Claude)
│   ├── profile.js           (ES export, JSDoc annotated)
│   ├── body-stats.js        (ES export)
│   ├── plate-calc.js        (ES export)
│   └── supabase-check.js    (ES export)
├── sw.js                    (CACHE_NAME bumped to v3, updated ASSETS list)
└── css/ (unchanged in Phase 1)
```
