# STRUCTURE.md — Athlete Pro

## Directory Layout
```
athlete-pro/
├── index.html          # App shell, inline critical CSS, bootstrap JS, Nav, Toast
├── server.js           # Express backend — static serve + API proxy
├── sw.js               # Service Worker (cache-first, athlete-pro-v2)
├── manifest.json       # PWA manifest
├── package.json        # Dependencies + npm scripts
│
├── js/
│   ├── db.js           # IndexedDB layer — Workouts, OneRM, Metrics, Settings, Events, Backup
│   ├── db-firebase.js  # Firebase/Firestore optional cloud sync
│   ├── supabase-check.js # Supabase optional cloud sync
│   ├── dashboard.js    # Home screen — stats cards, PPL bars, streak calendar
│   ├── workout.js      # Active session — exercise select, set logging, RPE, rest timer
│   ├── analytics.js    # Stats screen — charts, volume trends, exercise history
│   ├── profile.js      # Profile screen — body metrics, export/import, settings
│   ├── claude.js       # AI Coach panel + Muscle Heatmap SVG builder
│   ├── body-stats.js   # Body stats screen
│   ├── timer.js        # Reusable rest timer module
│   └── plate-calc.js   # Plate calculator utility
│
├── css/
│   ├── dashboard.css   # Dashboard screen styles
│   ├── workout.css     # Workout screen styles
│   ├── analytics.css   # Analytics screen styles
│   ├── profile.css     # Profile screen styles
│   ├── claude.css      # AI Coach panel + heatmap styles
│   └── body-stats.css  # Body stats screen styles
│
├── icons/
│   ├── icon-192.png    # PWA icon (maskable)
│   ├── icon-512.png    # PWA icon (maskable)
│   ├── apple-touch-icon.png  # iOS home screen icon
│   └── favicon.png     # Browser tab icon
│
├── assets/             # Media assets
│   ├── panda-idle.mp4  # Animated AI Coach FAB (video, optional)
│   └── panda-idle.png  # Static AI Coach FAB fallback
│
└── node_modules/       # Dependencies (not committed)
```

## Key File Roles

### `index.html`
- App shell with 5 screen divs: `#s-home`, `#s-train`, `#s-stats`, `#s-body`, `#s-profile`
- Inline critical CSS (~300 lines) — design tokens, shell layout, nav, loading, toast, keyframes
- Bottom nav with 5 `<button.nav-btn>` elements
- Firebase SDK loaded from CDN (must be before `db-firebase.js`)
- All JS loaded with `defer` attribute
- Bootstrap script: clock, network detection, `Nav`, `Toast`, DB init, SW registration

### `server.js`
- 3 API routes + static file serving
- `POST /api/coach` — builds system prompt with athlete context, streams Claude response as SSE
- `GET /api/supabase-status` — proxies Supabase health check (CORS bypass)
- `GET /api/firebase-config` — exposes Firebase config from env to browser
- `_buildSystemPrompt()` — formats workout history + fatigue + 1RMs for Claude

### `js/db.js`
- Single `openDB()` factory, singleton `_db`
- 5 IndexedDB stores: `workouts`, `oneRM`, `bodyMetrics`, `events`, `settings`
- Public API: `DB.Workouts`, `DB.OneRM`, `DB.Metrics`, `DB.Settings`, `DB.Events`, `DB.Backup`

### `js/claude.js`
- `MUSCLE_MAP` — 22 exercises mapped to muscle groups
- `Heatmap` — computes fatigue scores from last 72h workouts
- `buildBodySVG(scores)` — generates 260×430 inline SVG with front/back body, colored by fatigue
- `Claude` IIFE — FAB button, slide-up sheet, SSE streaming, chat history

## Naming Conventions
- **JS files:** lowercase, hyphenated (`db-firebase.js`, `body-stats.js`, `plate-calc.js`)
- **CSS files:** match JS module name (`dashboard.css` ↔ `dashboard.js`)
- **JS globals:** PascalCase for module objects (`Dashboard`, `Workout`, `Claude`)
- **DB store names:** camelCase string constants in `S` object (`S.WORKOUTS`, `S.ORM`)
- **CSS classes:** BEM-ish kebab-case (`.nav-btn`, `.screen-header`, `.claude-fab`)
- **CSS variables:** `--c-*` for colors, `--sp-*` for spacing, `--r-*` for border-radius, `--t-*` for transitions

## Script Load Order (critical)
```html
<!-- 1. Firebase compat SDK (CDN) — must precede db-firebase.js -->
<!-- 2. db.js — IndexedDB layer (all modules depend on this) -->
<!-- 3. db-firebase.js, supabase-check.js -->
<!-- 4. timer.js, dashboard.js, workout.js, analytics.js, profile.js, claude.js -->
<!-- 5. body-stats.js, plate-calc.js -->
<!-- All loaded with defer — execute after DOMContentLoaded -->
```
