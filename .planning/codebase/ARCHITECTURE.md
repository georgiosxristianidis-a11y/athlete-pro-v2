# ARCHITECTURE.md — Athlete Pro

## Pattern
**Multi-page SPA** — single `index.html` shell with screen-switching via CSS opacity/pointer-events. No routing library. No framework.

## Layers

```
┌─────────────────────────────────────────────────────┐
│                  Browser (PWA)                       │
│                                                      │
│  index.html (shell + inline critical CSS + bootstrap)│
│       │                                              │
│  ┌────┴─────────────────────────────────────────┐   │
│  │  Module JS (deferred, global scope)           │   │
│  │  dashboard.js  workout.js   analytics.js      │   │
│  │  profile.js    claude.js    body-stats.js     │   │
│  │  timer.js      plate-calc.js                 │   │
│  └────┬─────────────────────────────────────────┘   │
│       │                                              │
│  ┌────┴──────────┐  ┌─────────────┐                 │
│  │  db.js        │  │ localStorage│                 │
│  │  IndexedDB    │  │ (custom plan│                 │
│  │  5 stores     │  │  only)      │                 │
│  └───────────────┘  └─────────────┘                 │
│                                                      │
│  sw.js (Service Worker — cache-first)                │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP (fetch)
┌──────────────────▼──────────────────────────────────┐
│               server.js (Node/Express)               │
│                                                      │
│  GET  /api/supabase-status  → proxy health check    │
│  GET  /api/firebase-config  → expose env config     │
│  POST /api/coach            → SSE streaming (Claude)│
│  *    static files          → express.static        │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS
          ┌────────┴────────┐
          │  Anthropic API  │
          │  claude-opus-4-6│
          └─────────────────┘
```

## Module Architecture (Global Namespace)
All JS modules expose globals — no ES modules, no bundler:

| Global | File | Responsibility |
|--------|------|----------------|
| `DB` / `Workouts` / `OneRM` / `Metrics` / `Settings` / `Events` / `Backup` | `js/db.js` | IndexedDB CRUD layer |
| `Dashboard` | `js/dashboard.js` | Home screen — stats, PPL bars, streak |
| `Workout` | `js/workout.js` | Active workout — exercise selection, set logging, timer |
| `Analytics` | `js/analytics.js` | Charts, volume trends, exercise history |
| `Profile` | `js/profile.js` | Body metrics, settings, data export/import |
| `Claude` | `js/claude.js` | AI coach panel + muscle heatmap SVG |
| `renderBodyStats` | `js/body-stats.js` | Body stats screen |
| `Timer` | `js/timer.js` | Rest timer module |
| `Nav` | `index.html` (inline) | Screen navigation |
| `Toast` | `index.html` (inline) | Toast notification system |
| `PlateCalc` | `js/plate-calc.js` | Plate calculator utility |

## Navigation Model
```javascript
// index.html bootstrap
window.Nav = {
  go(id) { /* show/hide .screen divs, call screen handler */ }
}
// Screen IDs: s-home, s-train, s-stats, s-body, s-profile
```
- Screens are `position: absolute` divs, toggled via `.active` class (CSS opacity + transform)
- No URL routing — back button does nothing
- Each screen handler is called on navigation: `Dashboard.load()`, `Workout.renderSelect()`, etc.

## Data Flow

### Workout Save
```
Workout.js → user logs sets → Workout._save()
  → DB.Workouts.save(session)        [IndexedDB]
  → DB.OneRM.update(exercise, w, r)  [IndexedDB]
  → Toast.show('Saved')
```

### AI Coach
```
Claude.open()
  → DB.Workouts.getLast(5) + DB.OneRM.getAll() + Heatmap.compute()
  → fetch POST /api/coach (SSE)
  → server.js → anthropic.messages.stream()
  → SSE chunks → DOM textContent streaming
```

### Muscle Heatmap
```
Heatmap.compute()
  → DB.Workouts.getAll() (last 72h)
  → MUSCLE_MAP lookup per exercise
  → linear decay by age (hours/72)
  → scores {muscle: 0..1}
  → buildBodySVG(scores) → inline SVG with colored muscle paths
```

## Entry Point
```javascript
// index.html DOMContentLoaded
openDB()
  .then(() => {
    if (!Workout.init()) Dashboard.load();  // restore interrupted session
  })
  .finally(() => hide loading screen)
```

## State Management
- **No global state store** — each module manages its own state
- `Workout`: `_session` object (in-memory + `localStorage` for interrupted sessions)
- `Claude`: `_chatHistory`, `_context`, `_streaming` (module-scoped IIFE vars)
- `Dashboard`: stateless — reloads from DB on each `Dashboard.load()` call
