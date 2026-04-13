# STACK.md — Athlete Pro

## Runtime & Language
- **Frontend:** Vanilla JavaScript (ES6+, `'use strict'`), no bundler/transpiler
- **Backend:** Node.js + Express 4.x
- **Language:** JavaScript only (no TypeScript)

## Frontend Stack
| Layer | Technology |
|---|---|
| UI Framework | None — plain DOM manipulation |
| CSS | Vanilla CSS with custom properties (design tokens) |
| Font | Google Fonts — Outfit (400/500/600/700/800) |
| Storage | IndexedDB (via `js/db.js` wrapper) + `localStorage` (custom plan only) |
| PWA | Service Worker (`sw.js`), Web App Manifest (`manifest.json`) |
| Icons | Firebase compat SDK (CDN) for Firestore |

## Backend Stack
| Layer | Technology |
|---|---|
| Server | Express 4.21.2 |
| AI SDK | `@anthropic-ai/sdk` ^0.51.0 |
| Config | `dotenv` ^16.4.5 |
| Streaming | Server-Sent Events (SSE) via `res.write()` |

## Key Dependencies (`package.json`)
```json
"@anthropic-ai/sdk": "^0.51.0"
"dotenv":            "^16.4.5"
"express":           "^4.21.2"
```

## AI Model
- `claude-opus-4-6` — hardcoded in `server.js:88`
- `max_tokens: 400` per response
- Streaming via `anthropic.messages.stream()`

## CSS Architecture
- Design tokens via CSS custom properties in `index.html` inline `<style>`
- Module CSS files: `css/dashboard.css`, `css/workout.css`, `css/analytics.css`, `css/profile.css`, `css/claude.css`, `css/body-stats.css`
- Critical CSS inlined in `<head>` to prevent FOUC

## Build / Dev
- No build step — files served directly
- `npm start` → `node server.js`
- `npm run dev` → `node --watch server.js` (auto-restart)
- Default port: `3000` (configurable via `PORT` env var)

## Service Worker Cache
- Cache name: `athlete-pro-v2`
- Strategy: cache-first, network fallback
- 18 static assets precached on install

## Environment Variables (`.env`)
```
ANTHROPIC_API_KEY=     # required for AI Coach
PORT=                  # optional, default 3000
SUPABASE_URL=          # optional cloud sync
SUPABASE_ANON_KEY=     # optional cloud sync
FIREBASE_PROJECT_ID=   # optional cloud sync
FIREBASE_API_KEY=      # optional cloud sync
FIREBASE_AUTH_DOMAIN=  # optional cloud sync
FIREBASE_APP_ID=       # optional cloud sync
```

## Browser APIs Used
- `indexedDB` — primary data store
- `localStorage` — custom workout plan (`ap-custom-plan`)
- `navigator.serviceWorker` — PWA offline support
- `navigator.onLine` — network status
- `fetch` + `ReadableStream` — SSE streaming
- `CSS env()` — safe area insets for iOS
- `backdrop-filter` — glassmorphism nav
