# INTEGRATIONS.md — Athlete Pro

## Claude AI (Anthropic)
- **Purpose:** AI coaching — workout recommendations, follow-up chat
- **SDK:** `@anthropic-ai/sdk` ^0.51.0
- **Model:** `claude-opus-4-6` (hardcoded in `server.js:88`)
- **Endpoint:** `POST /api/coach` (proxied through Express to avoid CORS / key exposure)
- **Protocol:** Server-Sent Events (SSE) streaming
- **Config:** `ANTHROPIC_API_KEY` in `.env`
- **Context sent:** last 5 workouts, muscle fatigue scores, top 5 estimated 1RMs
- **Max tokens:** 400 per response

### System prompt structure (`server.js:111–147`)
```
You are an expert PPL strength and conditioning coach.
## Athlete Data
**Recent Workouts:** [type, hoursAgo, tonnageKg, durationMin, exercises]
**Muscle Fatigue (72h window):** [muscle: percent%]
**Top Estimated 1RMs:** [exercise: kg]
```

## Supabase (Optional Cloud Sync)
- **Purpose:** Cloud backup / sync of workout data
- **Status check:** `GET /api/supabase-status` (server proxies to avoid CORS)
- **Config:** `SUPABASE_URL` + `SUPABASE_ANON_KEY` in `.env`
- **Client file:** `js/supabase-check.js`
- **Fallback:** If not configured (`url.includes('your-project')`), returns `{ available: false, reason: 'not_configured' }`
- **Timeout:** 6 seconds via `AbortSignal.timeout(6000)`

## Firebase / Firestore (Optional Cloud Sync)
- **Purpose:** Alternative cloud sync backend
- **SDK:** Firebase compat v10.12.0 loaded from CDN
  ```html
  https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js
  https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js
  ```
- **Config endpoint:** `GET /api/firebase-config` (server exposes config to browser)
- **Config:** `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID` in `.env`
- **Client file:** `js/db-firebase.js`
- **Fallback:** If `projectId.includes('your-firebase')`, returns `{ configured: false }`

## Google Fonts
- **Font:** Outfit (weights 400–800)
- **Load strategy:** `<link rel="preconnect">` + standard stylesheet link
- **Fallback:** `-apple-system, BlinkMacSystemFont, sans-serif`
- **Offline:** Not cached by service worker — falls back to system font

## PWA / Platform
- **Web App Manifest:** `manifest.json` — standalone display, portrait orientation
- **Apple PWA meta:** `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`
- **Shortcut:** "Start Workout" shortcut to `index.html#train`
- **Icons:** 192px, 512px (maskable), 180px apple-touch-icon

## No Auth Provider
- No user authentication implemented
- All data is local (IndexedDB) or optionally synced via Supabase/Firebase
- No user accounts, sessions, or tokens
