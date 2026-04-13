# Code Conventions — Athlete Pro

## Overview
This document describes the coding conventions, patterns, and style guidelines observed across the Athlete Pro codebase. The project is a browser-based PPL (Push/Pull/Legs) workout tracker with Node.js backend integration.

---

## File Structure & Organization

### JavaScript Modules
- **Client-side**: `/js/` directory, organized by feature (timer, analytics, dashboard, etc.)
- **Server-side**: `server.js` at root
- **Styling**: `/css/` directory with feature-specific stylesheets
- **HTML**: `index.html` at root with inline critical CSS

### File Header Convention
All JavaScript files begin with a structured header comment with visual separators:

```javascript
/* ════════════════════════════════════════════════════════
   filename.js — Athlete Pro  |  Block # / Description
   One-line summary of purpose
   ════════════════════════════════════════════════════════ */
```

Examples from codebase:
- `timer.js`: "timer.js — Athlete Pro | Isolated timer module"
- `db.js`: "db.js — Athlete Pro | IndexedDB data layer, Block 2"
- `claude.js`: "claude.js — Athlete Pro | Block 8, Claude AI Assistant + Muscle Heatmap"

---

## Naming Conventions

### Variable Names
- **Private module state**: Prefixed with underscore `_`
  - Timer: `_start`, `_elapsed`, `_running`, `_interval`, `_onTick`
  - Database: `_db`
  - UI: `_overlay`, `_bsActiveTab`

- **Constants**: UPPER_SNAKE_CASE
  - Database: `DB_NAME = 'athlete-pro'`, `DB_VERSION = 1`, `STORAGE_KEY = 'ap-timer-state'`
  - Store abbreviations: `S = { WORKOUTS, ORM, METRICS, EVENTS, SETTINGS }`
  - Data: `PLATES = [[25, '#c62828', '#fff', 88, 17], ...]`, `BAR_OPTS = [20, 15, 10]`

- **Local variables**: camelCase
  - `workouts`, `totalVol`, `remainingWeight`, `screen`, `template`, `entries`

- **DOM element references**: Descriptive camelCase (prefix with El)
  - `weightEl`, `barbellEl`, `textEl`, `screenEl`

### Storage Keys (localStorage)
Prefixed with `ap-` (Athlete Pro identifier):
- `ap-timer-state` (timer persistence)
- `ap-bar-weight` (plate calculator state)
- `ap-custom-plan` (workout plan)
- `ap-body-stats` (body measurements)
- `ap-active-session` (current workout)
- `ap-hidden-at` (visibility API timestamp)

### Shorthand Conventions
Single-letter vars are used consistently for mathematical/physical quantities:

| Abbrev | Meaning | Context |
|--------|---------|---------|
| `w` | weight | plate calc, workout data |
| `h` | height / hours | canvas dims, time calculations |
| `m` | minutes / months | time formatting |
| `s` | seconds | time formatting |
| `k` | kilograms (display) | volume formatting: `(kg/1000).toFixed(1)+'k'` |
| `fg`, `bg` | foreground/background | color values |
| `pw` | plate width | plate dimensions |
| `n` | number/count | iterations |
| `db` | database | connection reference |
| `tx` | transaction | IndexedDB transaction |
| `req2p` | request to promise | conversion function |
| `fmt` | format | formatting functions |

---

## Module Pattern

### IIFE (Immediately Invoked Function Expression)
Primary encapsulation pattern across all client modules:

```javascript
const ModuleName = (() => {
  // Private state
  let _private = null;
  const CONSTANT = 'value';

  // Private helper functions
  function _helper() { }

  // Public methods
  function publicMethod(param) {
    // implementation
  }

  // Return public API only
  return { publicMethod, anotherMethod };
})();
```

Modules in codebase:
- **Timer**: `Timer = (() => { let _start, _elapsed, _running; return { start, pause, resume, reset, seconds, fmt, restore }; })()`
- **PlateCalc**: `PlateCalc = (() => { const PLATES = [...]; let _weight, _overlay; return { open, close, stepWeight, setBar }; })()`
- **Heatmap**: `Heatmap = (() => { async function compute() { } return { compute, scoreColor, scoreLabel }; })()`
- **Workout**: `Workout = (() => { const DEFAULT_PLAN = {...}; let State = {...}; return { select, startSession, ... }; })()`

### Database Layer Pattern
Separate namespace per entity, all return Promises:

```javascript
// DB.js exports these namespaces:
const Workouts = {
  save(session) { /* returns Promise<id> */ },
  getAll() { /* returns Promise<array> */ },
  getLast(n = 5) { /* returns Promise<array> */ },
  deleteById(id) { /* returns Promise */ },
  weeklyVolume() { /* returns Promise<number> */ },
  monthlyVolume() { /* returns Promise<number> */ },
};

const OneRM = {
  epley(weight, reps) { /* calculates 1RM */ },
  update(exerciseName, weight, reps) { /* returns Promise */ },
  get(exerciseName) { /* returns Promise<record|undefined> */ },
};

const DB = { Workouts, OneRM, Metrics, Settings, Events, Backup, clearAll, openDB };
```

### Server Routes Pattern
Express routes with error wrapping:

```javascript
app.post('/api/coach', async (req, res) => {
  const { workouts = [], fatigue = {}, messages = [] } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  try {
    // implementation
  } catch (err) {
    console.error('[/api/coach]', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

---

## Code Style

### Strictness
- `'use strict'` declared at top of every module file
- Applied in all client JS and server.js

### Formatting & Spacing
- **Indentation**: 2 spaces consistently
- **Line endings**: Single blank lines between logical sections, double before major blocks
- **Line length**: ~120 chars typical, longer acceptable for templates

**Visual Block Comments** (section dividers):
```javascript
/* ══════════════════════════════════════════════════
   SECTION NAME
   ══════════════════════════════════════════════════ */

/* ── Subsection with dashes ── */
```

**JSDoc-style comments** for public APIs:
```javascript
/** Get all sessions, sorted newest first. */
getAll() { ... }

/** Get last N sessions. */
getLast(n = 5) { ... }

/** Weekly volume (kg) — last 7 days. */
weeklyVolume() { ... }
```

**Inline comments** for logic clarification:
```javascript
const decay = Math.max(0, 1 - ageH / 72);  // linear decay over 72h
const rem = Math.round(((total - bar) / 2) * 100) / 100;  // floating-point safe
```

### Function Declaration Style
- **Traditional** `function` keyword for module methods (clarity)
- **Arrow functions** for callbacks and array methods

```javascript
// Module method
function start(onTick) {
  _onTick = onTick || _onTick;
  _start = Date.now();
}

// Callback
_interval = setInterval(_tick, 1000);

// Array operation
list.sort((a, b) => b.timestamp - a.timestamp)
```

### Optional Chaining
Used with browser APIs:
```javascript
navigator.vibrate?.([15]);  // Safe vibration API call
```

---

## Error Handling

### Try-Catch Patterns
Minimal and defensive, used for:
1. JSON parsing (parsing fails silently often)
2. Storage access (can throw SecurityError)
3. Critical initialization
4. API calls in async handlers

```javascript
// Storage with fallback
try {
  return JSON.parse(localStorage.getItem(BS_KEY) || '[]');
} catch {
  return [];  // Silent fallback
}

// IndexedDB initialization
try {
  const s = JSON.parse(raw);
  _elapsed = s.elapsed || 0;
  _running = s.running || false;
  return true;
} catch {
  return false;
}

// API with specific error handling
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
} catch (err) {
  console.error('[endpoint]', err.message);
  res.status(500).json({ error: err.message });
}
```

### Logging Conventions
Prefixed with module/endpoint name in square brackets, varying severity:

```javascript
console.log('Profile.load() called')              // trace
console.error('[db] open failed', err)            // error with context
console.warn('[FirebaseDB] Not configured...')    // warning
console.info('[FirebaseDB] Connected...')         // info
console.group('[SupabaseCheck] Running...')       // grouped output
console.groupEnd()
```

### Promise Error Handling
- `.catch()` for critical async operations
- async/await with try-catch for sequences
- No error silencing — errors logged explicitly

```javascript
// Critical init catches logged
openDB().catch(err => console.error('[db] open failed', err));

// Async function error handling
async function load() {
  try {
    const settings = await DB.Settings.getAll();
    screen.innerHTML = template(settings);
  } catch (err) {
    console.error('Profile load error', err);
  }
}
```

---

## Data Structures

### Core Objects
**Workout session:**
```javascript
{
  id: 1,                          // auto-increment
  type: 'push',                   // 'push' | 'pull' | 'legs'
  date: '2025-03-16',
  timestamp: 1710604800000,
  duration: 45,                   // minutes
  tonnage: 2840,                  // total kg moved
  exercises: [
    {
      name: 'Bench Press',
      sets: [
        { weight: 100, reps: 8, done: true, rpe: 7 }
      ]
    }
  ]
}
```

**Body metrics:**
```javascript
{
  id: 1,                          // auto-increment
  weight: 75.5,
  height: 180,                    // cm
  chest: 98,                      // cm (optional)
  waist: 82,
  bicep: 35,
  bmi: 23.3,
  body_fat: 15,                   // % (optional)
  timestamp: 1710604800000
}
```

**Settings (key-value):**
```javascript
{
  key: 'rest-duration',
  value: 90
}
```

**One-rep max (Epley):**
```javascript
{
  id: 'Bench Press',              // exercise name
  value: 140,                     // kg
  timestamp: 1710604800000
}
```

### Null vs Undefined
- Use `null` for intentional absence
- Check with: `if (!value)`, `value || fallback`, `value ?? fallback`

```javascript
return existing || null;
const latest = list.find(w => w.type === type) || null;
const rest = settings['rest-duration'] || 90;
```

---

## DOM Conventions

### ID & Class Naming

**IDs** (semantic, prefixed):
- `s-train`, `s-stats`, `s-profile` (screens)
- `pc-weight-val`, `pc-barbell` (plate calc)
- `an-total-vol`, `an-avg-time` (analytics)
- `dash-greeting-label`, `dash-vol-week` (dashboard)

**Classes** (kebab-case, component-based):
```css
.stat-chip
.stat-chip-label
.stat-chip-val
.stat-chip-unit

.modal-overlay
.modal-sheet
.modal-handle
.modal-title

.btn-icon-sm
.btn-icon-nav
.btn-primary
```

**Data attributes:**
- `data-w` (weight value)
- `data-muscle` (muscle group)
- `data-date` (date string)
- `data-type` (type identifier)

### Element Creation
Strongly prefer HTML string templates over imperative DOM:

```javascript
// Good: Template literal
_overlay.innerHTML = `
  <div class="modal-sheet pc-sheet">
    <div class="modal-handle"></div>
    <div class="modal-header">
      <span class="modal-title">Plate Calculator</span>
      <button onclick="PlateCalc.close()">
        <svg>...</svg>
      </button>
    </div>
    <div class="pc-content">...</div>
  </div>
`;

// Avoid: Imperative build
// const div = document.createElement('div');
// const span = document.createElement('span');
// div.appendChild(span);
```

### Event Binding
Three styles used consistently:

```javascript
// 1. Inline in HTML templates (onclick)
<button onclick="PlateCalc.stepWeight(-2.5)">Decrease</button>
<button onclick="Profile.setUnit('kg')">kg</button>

// 2. Event delegation for dynamic content
_overlay.addEventListener('click', e => {
  if (e.target === _overlay) close();  // click outside
});

// 3. Page lifecycle (document/window)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { /* pause */ }
  else { /* resume */ }
});

document.addEventListener('DOMContentLoaded', () => {
  // Init code
});
```

---

## CSS Conventions

### Design Token System
Comprehensive custom properties in `:root`:

```css
:root {
  /* Colors — 9-color palette + variants */
  --c-bg:        #0a0a0f;        /* main background */
  --c-bg-1:      #111118;        /* elevated surface */
  --c-bg-2:      #16161f;        /* cards */
  --c-bg-3:      #1c1c28;        /* modals */
  --c-text-1:    #e8eaed;        /* primary text */
  --c-text-2:    #9aa0ab;        /* secondary text */
  --c-text-3:    #6b7280;        /* tertiary text */

  /* Accent colors */
  --c-accent:    #00e676;        /* push (green) */
  --c-purple:    #8b5cf6;        /* pull (purple) */
  --c-blue:      #2979ff;        /* legs (blue) */
  --c-amber:     #ffb300;        /* warning */
  --c-red:       #ff4757;        /* error */

  /* Background tints */
  --c-accent-bg: rgba(0,230,118,0.08);
  --c-purple-bg: rgba(139,92,246,0.08);
  --c-blue-bg:   rgba(41,121,255,0.08);

  /* Spacing — 8px grid */
  --sp-1: 8px;   --sp-2: 16px;  --sp-3: 24px;
  --sp-4: 32px;  --sp-5: 40px;  --sp-6: 48px;

  /* Borders & Corners */
  --r-s: 10px;   --r-m: 14px;   --r-l: 18px;  --r-xl: 22px;

  /* Shadows */
  --sh-sm: 0 2px 8px rgba(0,0,0,0.15);
  --sh-md: 0 4px 16px rgba(0,0,0,0.22);
  --sh-lg: 0 8px 32px rgba(0,0,0,0.32);

  /* Animations */
  --t-fast:   0.15s cubic-bezier(0.4,0,0.2,1);
  --t-normal: 0.25s cubic-bezier(0.4,0,0.2,1);
  --t-slow:   0.4s cubic-bezier(0.4,0,0.2,1);

  /* Safe areas (notch support) */
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

### Class Structure
Component-based naming with suffixes:

```css
/* Root component */
.stat-chip { }

/* Child elements */
.stat-chip-label { }
.stat-chip-val { }
.stat-chip-unit { }

/* Variants */
.stat-chip-purple { }
.stat-chip-blue { }

/* Responsive modifiers */
.stat-chip.active { }
.stat-chip.disabled { }
```

### Reset & Defaults
Mobile-first responsive design with safe areas:

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html { height: 100%; overflow: hidden; }
body {
  height: 100%;
  font-family: 'Outfit', system fonts;
  background: var(--c-bg);
  -webkit-font-smoothing: antialiased;
  user-select: none;
}
```

---

## Backend Patterns (server.js)

### Environment Management
```javascript
require('dotenv').config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Guard against missing config
if (!process.env.ANTHROPIC_API_KEY) {
  return res.status(500).json({
    error: 'ANTHROPIC_API_KEY not set in .env'
  });
}
```

### Route Structure
```javascript
app.post('/api/coach', async (req, res) => {
  // 1. Validate request
  const { workouts = [], fatigue = {}, messages = [] } = req.body;

  if (!messages.length) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // 2. Set response headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  try {
    // 3. Process
    const result = await anthropic.messages.stream({...});

    // 4. Stream response
    result.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    // 5. Signal completion
    res.write('data: [DONE]\n\n');
  } catch (err) {
    console.error('[/api/coach]', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }

  res.end();
});
```

### Server-Sent Events (SSE)
Format for streaming responses:

```javascript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');

// Send events
res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
res.write('data: [DONE]\n\n');
res.end();
```

---

## Async Patterns

### Promise Chains
Used heavily for IndexedDB sequences:

```javascript
function tx(store, mode = 'readonly') {
  return openDB().then(db => {
    const t = db.transaction(store, mode);
    return t.objectStore(store);
  });
}

// Chained reads with transforms
Workouts.getAll()
  .then(list => list.sort((a, b) => b.timestamp - a.timestamp))
  .then(sorted => sorted.slice(0, n))
  .then(data => renderList(data))
```

### Async/Await
Used for cleaner multi-step operations:

```javascript
async function export() {
  const [workouts, orm, metrics, settings] = await Promise.all([
    Workouts.getAll(),
    OneRM.getAll(),
    Metrics.getAll(),
    Settings.getAll(),
  ]);
  return JSON.stringify({ workouts, orm, metrics, settings }, null, 2);
}

async function load() {
  try {
    const screen = document.getElementById('s-profile');
    const settings = await DB.Settings.getAll();
    screen.innerHTML = buildTemplate(settings);
  } catch (err) {
    console.error('Profile load error', err);
  }
}
```

### Concurrency
- `Promise.all()` for parallel independent operations
- `.then().then()` for sequential dependent operations

---

## Notable Patterns

### Timer State Persistence
Survives tab hide, page reload:
```javascript
// Save to localStorage
_persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    start: _start, elapsed: _elapsed,
    running: _running, savedAt: Date.now(),
  }));
}

// Restore on load
function restore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    // ... restore state
    return true;
  } catch {
    return false;
  }
}
```

### Visibility API Integration
Pause/resume on tab visibility:
```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // pause timer, persist
    _elapsed += Date.now() - _start;
    _running = false;
    clearInterval(_interval);
    _persist();
  } else {
    // resume timer
    _start = Date.now();
    _running = true;
    _interval = setInterval(_tick, 1000);
  }
});
```

### requestAnimationFrame for Animations
Trigger CSS transitions:
```javascript
requestAnimationFrame(() => _overlay.classList.add('visible'));

// Later
setTimeout(() => _overlay.remove(), 300);  // after CSS transition
```

### Vibration API with Optional Chaining
Safe haptic feedback:
```javascript
navigator.vibrate?.([15]);  // 15ms pulse
navigator.vibrate?.([20]);  // 20ms pulse
```

### Canvas Sparklines
Efficient small charts:
```javascript
function bsDrawSparkline(canvas, values, color) {
  const W = canvas.width = (canvas.offsetWidth * devicePixelRatio) || 120;
  const H = canvas.height = (canvas.offsetHeight * devicePixelRatio) || 40;
  const ctx = canvas.getContext('2d');
  // ... plot points, draw filled area, stroke line
}
```

---

## Testing & Quality Observations

**No test framework found** — codebase relies on:
1. Manual integration testing via UI
2. Browser console logging for debugging
3. IndexedDB browser tools inspection
4. localStorage inspection in DevTools
5. Network tab for API debugging (SSE streams)

No test files (*.test.js, *.spec.js) exist in the repository.

---

## Summary of Key Principles

1. **Modularity**: IIFE encapsulation with single responsibility
2. **Naming**: Semantic with minimal abbreviations; `_prefix` for private
3. **Organization**: Clear file headers, visual section dividers, grouped logic
4. **Robustness**: Try-catch with fallbacks, console prefixes, error logging
5. **Performance**: Promise.all() for concurrency, requestAnimationFrame for DOM
6. **Browsers APIs**: Visibility, Storage, IndexedDB, Vibration (with polyfills)
7. **Conventions**: kebab-case DOM, camelCase JS, UPPER_SNAKE_CASE constants
8. **Comments**: Visual dividers, JSDoc for APIs, inline for logic
9. **CSS**: Token-based design system, mobile-first, safe-area support
10. **Backend**: Express routes, SSE streams, environment guards
