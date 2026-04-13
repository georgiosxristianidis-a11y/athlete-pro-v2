# Athlete Pro — Complete Build for Testing

Generated: 2026-03-13

## Structure

athlete-pro/
├── index.html ← App shell
├── sw.js ← ✅ FIXED Service Worker
├── manifest.json
├── js/
│ ├── db.js ← IndexedDB layer
│ ├── dashboard.js ← ✅ FIXED Dashboard
│ ├── workout.js ← Workout engine
│ ├── analytics.js ← Charts & stats
│ ├── profile.js ← Profile & metrics
│ ├── timer.js ← Timer module
│ └── claude.js ← AI Coach + Muscle Heatmap
├── css/
│ ├── dashboard.css
│ ├── workout.css
│ ├── analytics.css
│ ├── profile.css
│ └── claude.css
└── icons/
├── icon-192.png
├── icon-512.png
└── apple-touch-icon.png

## Local run (2 modes)

### Mode 1 — Static only (offline PWA, no `/api/*`)

Use this when you only need the frontend (no AI coach / no proxy endpoints).

Option A — Python:
`python -m http.server 8080`
→ Open `http://localhost:8080`

Option B — VS Code Live Server:
Open folder in VS Code → Go Live

### Mode 2 — Express server (serves frontend + `/api/*`)

Use this when you need:

- `POST /api/coach` (Anthropic AI Coach, optional)
- `GET /api/supabase-status` (optional)
- `GET /api/firebase-config` (optional)

1. Install deps:
   `npm install`

2. Create `.env` (copy from `.env.example`):
   `copy .env.example .env`

3. Start:
   `npm start`
   → App at `http://localhost:3000` (unless `PORT` is set)

If port 3000 is busy on your machine:

- Set another port: `set PORT=3100` (cmd) or `$env:PORT=3100` (PowerShell) and start again
- Or stop the other process using that port

## Fixes applied

- sw.js: cache install fixed, offline fallback fixed, ASSETS list complete
- js/dashboard.js: empty screen fixed, PPL bar animation fixed

## PWA Install test

1. Open in Chrome on Android/iOS or Chrome desktop
2. Look for "Add to Home Screen" prompt
3. DevTools → Application → Manifest → check all green ✅

## Environment variables

All variables are optional unless you use the related feature.

- `PORT`: server port (default `3000`)
- `ANTHROPIC_API_KEY`: required for `POST /api/coach`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`: required for `/api/supabase-status`
- `FIREBASE_*`: required for `/api/firebase-config`

## Deploy notes (example: Render)

This app is a Node server that serves static files and exposes `/api/*` endpoints.

- Build command: `npm ci`
- Start command: `npm start`
- Environment:
  - `PORT` is provided by the platform (your app should respect it)
  - Optional: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `FIREBASE_*`

If you don't set `ANTHROPIC_API_KEY`, the app still works, but `POST /api/coach` will return an error.
