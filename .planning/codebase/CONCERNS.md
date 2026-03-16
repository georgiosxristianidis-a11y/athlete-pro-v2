# CONCERNS.md — Athlete Pro

## Security

### HIGH — API Key Exposure via `/api/firebase-config`
- **File:** `server.js:54–66`
- **Issue:** `FIREBASE_API_KEY` is sent to the browser in plaintext via `GET /api/firebase-config`. Firebase API keys are intended to be public (security is via Firebase Rules), but this is worth noting.
- **Risk:** Low for Firebase (by design), but the pattern is dangerous if reused for other secrets.

### MEDIUM — No Input Validation on `/api/coach`
- **File:** `server.js:69–108`
- **Issue:** `messages`, `workouts`, `fatigue`, `topLifts` from request body are passed directly to Anthropic API with no schema validation or sanitization.
- **Risk:** Malformed data could cause unexpected API errors; no rate limiting.

### LOW — No Rate Limiting
- **File:** `server.js`
- **Issue:** `/api/coach` has no rate limiting. Each call streams from Claude Opus (expensive model).
- **Risk:** Cost exposure if the server is publicly accessible.

## Technical Debt

### Script Load Order is Fragile
- **File:** `index.html:456–469`
- **Issue:** All JS modules are global-scoped and loaded with `defer`. Firebase SDK must load before `db-firebase.js`. `db.js` must load before all other modules. Order is maintained manually via HTML order.
- **Risk:** Adding new files or reordering breaks the app silently.

### No Bundler / No Module System
- **Issue:** All modules leak to `window` scope. Global name collisions possible. No dead-code elimination or minification.
- **Impact:** Performance (unminified JS), maintainability (namespace pollution).

### `MUSCLE_MAP` is Hardcoded and Limited
- **File:** `js/claude.js:11–36`
- **Issue:** Only 22 exercises are mapped. Any exercise not in the map contributes 0 to heatmap.
- **Impact:** Heatmap accuracy degrades for users with custom exercise names.

### Custom Plan Stored in `localStorage`
- **File:** `js/claude.js:677`
- **Issue:** `localStorage.getItem('ap-custom-plan')` — custom workout plans stored in localStorage, not IndexedDB (unlike all other data). Inconsistent persistence layer.
- **Risk:** Data not included in `Backup.export()`.

### `Workouts.delete` vs `Workouts.deleteById` — Duplicate Methods
- **File:** `js/db.js:117–119` and `js/db.js:183–185`
- **Issue:** Both `deleteById(id)` and `delete(id)` do the same thing. One is dead code.

### IndexedDB Version Stuck at 1
- **File:** `js/db.js:9`
- **Issue:** `DB_VERSION = 1` — no migration path. Adding new stores or indexes requires incrementing and handling `onupgradeneeded` carefully.

### `_chatHistory` Grows Unbounded
- **File:** `js/claude.js:338`
- **Issue:** Chat history is only cleared when the panel is reopened (`_chatHistory = []` in `open()`). During a session, it grows indefinitely, but context is capped by Claude's API call structure (initial message + history).

## Performance

### `Workouts.getAll()` Loads All Records Every Time
- **File:** `js/db.js:106–109`
- **Issue:** No pagination or cursor-based reading — all workouts fetched into memory for every query (`weeklyVolume`, `monthlyCount`, `pplTonnage`, `weeklyTrend` all call `getAll()`).
- **Impact:** Performance degrades as workout history grows; multiple simultaneous calls not coalesced.

### Body SVG Re-generated on Every Coach Open
- **File:** `js/claude.js:429`
- **Issue:** `buildBodySVG(scores)` generates a large SVG string (~200 lines) on every panel open.
- **Impact:** Minor — string allocation, but the SVG is complex.

### Firebase SDK Loaded Unconditionally
- **File:** `index.html:456–457`
- **Issue:** Two Firebase CDN scripts (~100KB+) are loaded on every page load even if Firebase is not configured.
- **Impact:** Unnecessary network request and parse time.

## Missing Features / Gaps

### No Workout Edit
- Completed workouts cannot be edited, only deleted (`Workouts.deleteById`).

### No Data Sync Conflict Resolution
- If both Supabase and Firebase are configured, behavior is undefined.

### Service Worker Missing New JS Files
- **File:** `sw.js:10–32`
- `js/db-firebase.js`, `js/supabase-check.js`, `js/plate-calc.js` are NOT in the `ASSETS` precache list. These files won't be available offline.

### No Error Boundary for Module Init Failures
- If any `defer` module throws on load (e.g., Firebase SDK unavailable), other modules may fail silently since there's no top-level error handler.

### Clock Update Interval Too Slow
- **File:** `index.html:483`
- `setInterval(updateClock, 30000)` — clock updates every 30 seconds, so displayed time can be up to 29s stale.
