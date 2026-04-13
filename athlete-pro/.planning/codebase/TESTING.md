# Testing Patterns — Athlete Pro

## Overview
This document describes the testing infrastructure, testing patterns, and quality assurance approaches used in Athlete Pro. The codebase currently does **not use an automated testing framework**. Testing is manual and integration-based.

---

## Current Testing Status

### No Automated Test Framework
- **No Jest, Mocha, Vitest, or similar installed**
- **No test files** (*.test.js, *.spec.js) in the repository
- **No test scripts** in package.json
- **npm test** is not defined

### Testing is Manual
Testing is performed through:
1. **Browser UI interaction** — manual clicking, scrolling, input
2. **Browser DevTools console** — console.log inspection
3. **IndexedDB inspection** — checking stored data
4. **localStorage inspection** — checking persisted state
5. **Network tab debugging** — monitoring API calls and SSE streams
6. **Mobile/PWA testing** — testing on physical devices via Athlete Pro PWA installation

---

## Code Quality Patterns

### Defensive Programming
Code is written defensively to minimize runtime errors:

**Fallback defaults:**
```javascript
// Safe JSON parsing with fallback
try {
  return JSON.parse(localStorage.getItem(BS_KEY) || '[]');
} catch {
  return [];  // Always return valid structure
}

// Parameter defaults
function getLast(n = 5) {
  return this.getAll().then(list => list.slice(0, n));
}

// Optional chaining with navigator API
navigator.vibrate?.([15]);  // Safe even if undefined
```

**Guard clauses for early return:**
```javascript
async function load() {
  console.log('Profile.load() called');
  const screen = document.getElementById('s-profile');
  if (!screen) {
    console.error('s-profile screen not found');
    return;  // Exit early if precondition fails
  }

  try {
    const settings = await DB.Settings.getAll();
    screen.innerHTML = `...`;
  } catch (err) {
    console.error('Profile load error', err);
  }
}
```

**Configuration validation:**
```javascript
// Check before using
if (!process.env.ANTHROPIC_API_KEY) {
  return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in .env' });
}

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId || projectId.includes('your-firebase')) {
  return res.json({ configured: false });
}
```

**Null-safety checks:**
```javascript
// Safe array access
const doneSets = (ex.sets || []).filter(s => s.done).length;

// Safe object access with || operator
const muscles = MUSCLE_MAP[ex.name] || [];

// Check array length before indexing
if (plates.length === 0) {
  barbellEl.innerHTML = `<p>Bar only — no plates needed</p>`;
} else {
  // ... render plates
}
```

---

## Logging for Debugging

### Console Logging Patterns
Structured logging with contextual prefixes:

**Log levels observed:**

```javascript
// ERROR — critical failures
console.error('[db] open failed', err)
console.error('s-profile screen not found')
console.error('[/api/coach]', err.message)
console.error('[FirebaseDB] autoInit failed:', err.message)

// WARN — configuration issues
console.warn('[FirebaseDB] Not configured. Add Firebase vars to .env')

// INFO — successful operations
console.info('[FirebaseDB] Connected to project:', config.projectId)
console.info(`✅ Supabase reachable · ${latencyMs}ms · HTTP ${status}`)

// LOG — trace-level debugging
console.log('Profile.load() called')
console.log('[db] open started')
console.log('Full result:', result)

// GROUP — structured output
console.group('[SupabaseCheck] Running availability test…')
// ... grouped logs
console.groupEnd()
```

**Prefix convention:**
- Module/endpoint name in square brackets: `[module-name]`
- Icons for visual clarity: `✅`, `❌`, `⚠`

### Logging Locations in Code

From `profile.js`:
```javascript
async function load() {
  console.log('Profile.load() called');
  const screen = document.getElementById('s-profile');
  if (!screen) {
    console.error('s-profile screen not found');
    return;
  }

  try {
    const settings = await DB.Settings.getAll();
    // ... render
  } catch (err) {
    console.error('Profile load error', err);
  }
}
```

From `db.js`:
```javascript
// Initialization check
openDB().catch(err => console.error('[db] open failed', err));
```

From `supabase-check.js`:
```javascript
console.group('[SupabaseCheck] Running availability test…');
console.warn('⚠  Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env');
console.info(`✅ Supabase reachable · ${result.latencyMs}ms · HTTP ${result.status}`);
console.error(`❌ Supabase unreachable · reason: ${result.reason} · after ${elapsed}ms`);
console.log('Full result:', result);
console.groupEnd();
```

---

## Manual Integration Testing Approaches

### Browser DevTools Integration Testing

**IndexedDB Inspection:**
- Open DevTools → Application → IndexedDB
- Database: `athlete-pro`
- Stores: `workouts`, `oneRM`, `bodyMetrics`, `events`, `settings`
- Manually inspect records after:
  - Saving a new workout
  - Updating 1RM
  - Logging body metrics
  - Changing settings

Example workflow:
1. Complete a workout in UI
2. Check IndexedDB → `athlete-pro` → `workouts` → verify new record
3. Check `oneRM` store for updated 1RM
4. Verify timestamp matches current time

**localStorage Inspection:**
- Open DevTools → Application → Storage → Local Storage
- Verify state keys exist after actions:
  - `ap-timer-state` after starting/stopping timer
  - `ap-bar-weight` after changing plate weight
  - `ap-active-session` during workout
  - `ap-custom-plan` after editing plan

Example workflow:
1. Start timer
2. Check localStorage → `ap-timer-state`
3. Verify: `{ start: timestamp, elapsed: 0, running: true, savedAt: timestamp }`
4. Hide tab → verify state persists
5. Show tab → verify timer resumes

**Network Tab Testing (SSE):**
- Open DevTools → Network
- Trigger AI coach request
- Monitor `/api/coach` request
- Verify response streams as `text/event-stream`
- Check for proper `data:` delimited chunks
- Verify termination with `[DONE]`

Example stream format:
```
data: {"text":"Good"}
data: {"text":" work"}
data: {"text":"out"}
...
data: [DONE]
```

**Console Errors:**
- Always check DevTools Console for errors during interaction
- Look for missing elements: `s-profile screen not found`
- Look for database errors: `[db] open failed`
- Look for API errors: `[/api/coach] Network error`

### Browser API Testing

**Visibility API:**
1. Start timer
2. Switch to another tab
3. Return to tab
4. Verify timer continues correctly
5. Check `ap-hidden-at` localStorage key during hide
6. Verify cleanup after show

**Vibration API:**
- On mobile: UI actions should vibrate
- On desktop: navigator.vibrate?.() is silently ignored
- Test with: `navigator.vibrate?.([50, 25, 50])` in console

**Storage Persistence:**
1. Load app
2. Add data (workout, metrics, settings)
3. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
4. Verify data persists
5. Check localStorage and IndexedDB are both populated

**PWA Installation:**
- Install app on mobile (Settings → Install app)
- Run offline (toggle airplane mode)
- Verify UI still loads (cached via service worker `sw.js`)
- Verify locally cached data loads from IndexedDB
- Verify new actions queue (not currently implemented)

---

## Data Validation Testing

### Input Validation Patterns

**Weight/Height numeric validation:**
```javascript
// From body-stats.js
function bsSaveEntry(editDate) {
  const entry = { date };
  let hasAny = false;

  BS_FIELDS.forEach(f => {
    const v = parseFloat(document.getElementById(`bs-${f.id}-input`)?.value);
    if (!isNaN(v) && v > 0) {  // Validate: numeric and positive
      entry[f.id] = v;
      hasAny = true;
    }
  });

  if (!hasAny) {
    Toast.show('Enter valid weight and height', 'error');  // User feedback
    return;
  }

  // ... save
}
```

**Set/rep validation in workout:**
- Weight must be positive number (or 0 for bodyweight)
- Reps must be positive integer (1-99 typically)
- RPE must be 1-10 scale
- UI prevents invalid entry via input constraints

**Date validation:**
```javascript
function bsFmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
```

### Error Scenarios Testing

**Storage quota exceeded:**
- Test by repeatedly saving large workouts
- IndexedDB should gracefully handle quota
- UI may need fallback message

**Corrupted localStorage data:**
- Manually set bad JSON: `localStorage.setItem('ap-timer-state', '{')`
- App should catch and treat as empty state
- See try-catch fallbacks above

**Missing DOM elements:**
- Dynamically generated screens may not exist yet
- Code guards: `if (!screen) return;`
- Tests: Remove element from HTML, verify graceful degradation

**Database initialization failures:**
```javascript
openDB().catch(err => console.error('[db] open failed', err));
```
- First failure logged but doesn't crash app
- Subsequent DB calls will retry via promise chain

---

## Performance Testing (Manual)

### Metrics Inspection

**Page Load:**
- Open DevTools → Performance tab
- Record page load
- Check First Contentful Paint (FCP)
- Check Largest Contentful Paint (LCP)
- Target: < 2s on slow 3G

**Interaction latency:**
- Time from click to response visible
- Workout session start should be < 500ms
- Analytics load should be < 1s

**Memory usage:**
- Open DevTools → Memory tab
- Take heap snapshot
- Load app
- Interact (add workouts, metrics)
- Take another snapshot
- Compare heap sizes (should not grow unboundedly)

### Canvas rendering (sparklines, charts)
- `bsDrawSparkline()` in body-stats.js
- Renders canvas at device pixel ratio for crisp lines
- Test with zoom 200% to verify high-DPI support
- Check performance with 365 daily data points

---

## Error Tracking Recommendations

### Suggested Future Improvements

**1. Error Reporting Service (e.g., Sentry)**
```javascript
// Current: only console.error
console.error('[db] open failed', err);

// Recommended: also report
if (window.Sentry) {
  Sentry.captureException(err, { tags: { module: 'db' } });
}
```

**2. User-facing error boundaries**
```javascript
async function loadWithFallback() {
  try {
    return await load();
  } catch (err) {
    Toast.show('Failed to load. Please refresh.', 'error');
    console.error('Critical error:', err);
  }
}
```

**3. Data validation schema (e.g., Zod or Joi)**
```javascript
// Current: manual checks
if (!isNaN(v) && v > 0) { entry[f.id] = v; }

// Recommended: schema-based
const EntrySchema = z.object({
  date: z.string().date(),
  weight: z.number().positive(),
  height: z.number().positive().max(300),
});

const validated = EntrySchema.safeParse(entry);
if (!validated.success) {
  Toast.show(validated.error.issues[0].message, 'error');
}
```

**4. End-to-end tests (e.g., Playwright, Cypress)**
```javascript
// Example: Start workout flow
test('should complete a push workout', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.click('[onclick="Nav.go(\'s-train\')"]');  // Start button
  await page.click('button:has-text("Push")');           // Select push
  await page.click('button:has-text("Start")');          // Begin
  await page.fill('[name="sets"]', '4');
  // ... verify IndexedDB state
  const record = await page.evaluate(() => {
    return new Promise(resolve => {
      const req = indexedDB.open('athlete-pro');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('workouts');
        const store = tx.objectStore('workouts');
        const getReq = store.getAll();
        getReq.onsuccess = () => resolve(getReq.result);
      };
    });
  });
  expect(record[0].type).toBe('push');
});
```

**5. Unit tests for pure functions**
```javascript
// Example tests for db.js OneRM.epley()
describe('OneRM', () => {
  test('epley(100, 1) should return 100', () => {
    expect(OneRM.epley(100, 1)).toBe(100);
  });

  test('epley(100, 5) should return 117', () => {
    expect(OneRM.epley(100, 5)).toBe(117);
  });

  test('epley(80, 10) should return 106', () => {
    expect(OneRM.epley(80, 10)).toBe(106);
  });
});
```

```javascript
// Example tests for timer formatting
describe('Timer.fmt()', () => {
  test('fmt(45) should return "00:45"', () => {
    expect(Timer.fmt(45)).toBe('00:45');
  });

  test('fmt(125) should return "02:05"', () => {
    expect(Timer.fmt(125)).toBe('02:05');
  });

  test('fmt(3661) should return "1:01:01"', () => {
    expect(Timer.fmt(3661)).toBe('1:01:01');
  });
});
```

```javascript
// Example tests for analytics calculations
describe('Analytics', () => {
  test('weeklyVolume should sum tonnage from last 7 days', async () => {
    // Mock data
    const workouts = [
      { timestamp: Date.now() - 1000, tonnage: 2840 },
      { timestamp: Date.now() - 3000, tonnage: 2500 },
    ];

    // Would test Analytics.weeklyVolume()
  });

  test('monthlyCount should count sessions from calendar month', async () => {
    // Similar setup
  });
});
```

---

## Testing Checklist for Features

### When Adding a New Feature

1. **Manual UI test:**
   - [ ] Test on mobile (Chrome DevTools mobile emulation)
   - [ ] Test on tablet (landscape/portrait)
   - [ ] Test with zoom 150%
   - [ ] Test with dark mode toggle
   - [ ] Check DevTools console for errors

2. **Data persistence:**
   - [ ] Check IndexedDB updated correctly
   - [ ] Hard refresh page, verify data intact
   - [ ] Close browser, reopen, verify data restored

3. **Offline functionality:**
   - [ ] Toggle DevTools Network → Offline
   - [ ] Verify cached screens still load
   - [ ] Verify local data operations work (IndexedDB reads)
   - [ ] Test reconnection gracefully

4. **Browser API edge cases:**
   - [ ] Test with Vibration API disabled (desktop)
   - [ ] Test with Storage quota low
   - [ ] Test with IndexedDB unavailable (private browsing)
   - [ ] Test with localStorage disabled

5. **Performance:**
   - [ ] DevTools → Performance → Record
   - [ ] Verify no layout thrashing (forced reflows)
   - [ ] Verify Promise chains resolve in expected order
   - [ ] Check memory heap doesn't grow unboundedly

6. **Accessibility (manual):**
   - [ ] Test keyboard navigation (Tab through buttons)
   - [ ] Test screen reader (if applicable)
   - [ ] Verify focus indicators visible
   - [ ] Verify color contrast meets WCAG AA

---

## Test Data Setup

### Pre-populating Data for Manual Testing

**Via JavaScript Console:**
```javascript
// Add sample workout
const session = {
  type: 'push',
  date: new Date().toISOString().split('T')[0],
  timestamp: Date.now(),
  duration: 45,
  tonnage: 2840,
  exercises: [
    { name: 'Bench Press', sets: [
      { weight: 100, reps: 8, done: true, rpe: 7 }
    ]}
  ]
};

DB.Workouts.save(session).then(id => console.log('Saved:', id));

// Add body metrics
DB.Metrics.save(75.5, 180).then(() => console.log('Metrics saved'));

// Update 1RM
DB.OneRM.update('Bench Press', 100, 8).then(() => console.log('1RM updated'));
```

**Via IndexedDB Inspector:**
1. DevTools → Application → IndexedDB
2. Right-click store → Add entry
3. Manually type JSON object
4. Verify UI reflects new data

---

## Coverage Analysis

### Uncovered Scenarios (Known Gaps)

1. **No Firebase tests** — FirebaseDB module requires real Firebase instance
2. **No Supabase tests** — SupabaseDB checks only health endpoint
3. **No Claude API tests** — Requires ANTHROPIC_API_KEY, SSE mocking complex
4. **No multi-tab sync** — localStorage changes don't sync across tabs
5. **No conflict resolution** — If two tabs save simultaneously
6. **No quota handling** — What happens when IndexedDB quota exceeded
7. **No offline sync** — No queue for offline changes

---

## Debugging Guide

### Common Issues & Solutions

**Issue: Timer doesn't persist across page reload**
- Check: localStorage has `ap-timer-state` key
- Check: Timer.restore() called on page load
- Solution: Verify `openDB().then(() => Timer.restore())`

**Issue: Workouts not saving**
- Check: IndexedDB → athlete-pro → workouts is empty
- Check: Console for `[db] open failed` error
- Check: Database transaction mode is `'readwrite'` not `'readonly'`
- Solution: Verify IndexedDB supported in browser (not private mode)

**Issue: 1RM not updating**
- Check: OneRM.update() promise resolves
- Check: OneRM store has records
- Check: New weight > old weight (Epley only updates if higher)
- Solution: Call `DB.OneRM.update('Bench Press', 150, 1)` in console

**Issue: Body stats not showing sparklines**
- Check: Canvas elements rendered (`<canvas id="bs-...">`)
- Check: bsDrawSparkline() receives valid data array
- Check: Canvas not hidden by CSS (check z-index, display)
- Solution: Verify `devicePixelRatio` multiplication correct

**Issue: API coach endpoint returns error**
- Check: ANTHROPIC_API_KEY set in .env
- Check: Network tab shows request body has messages array
- Check: Response is SSE format (text/event-stream)
- Solution: Test with curl: `curl -X POST http://localhost:3000/api/coach -H "Content-Type: application/json" -d '{"messages": [...]}'`

---

## Summary

### Current State
- **No automated tests** — manual integration testing only
- **Defensive code** — guards, fallbacks, try-catch blocks
- **Console logging** — structured with prefixes for debugging
- **Browser DevTools** — primary debugging tool
- **Logging, not assertions** — errors logged but not tested

### Recommended Next Steps
1. Add unit tests for pure functions (OneRM.epley, Timer.fmt, etc.)
2. Add Sentry for production error tracking
3. Add E2E tests with Playwright for critical flows
4. Add schema validation (Zod) for data structures
5. Add JSDoc comments for test documentation
6. Consider test framework: Jest (Node), Vitest (Vite), or Playwright (E2E)

### Best Practices Observed
✓ Fallback defaults for storage operations
✓ Guard clauses for DOM access
✓ Configuration validation before use
✓ Structured console logging
✓ Promise error catching
✓ Try-catch for JSON parsing
✓ Optional chaining for browser APIs

### Quality Priorities
1. **Robustness over coverage** — prevent crashes with fallbacks
2. **Debugging over testing** — console logs for troubleshooting
3. **Manual validation** — human verification of UX/data
4. **Offline-first** — data persisted locally, sync later
