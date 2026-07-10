# Athlete Pro — Offline-First Workout Tracker + AI Coach

Privacy-first PPL workout tracker built as an installable PWA. Your training data lives
on your device (IndexedDB, airgap mode by default) — the cloud is optional, the AI coach
is bring-your-own-key.

**Live:** [athlete-pro-v7.vercel.app](https://athlete-pro-v7.vercel.app)

## Why it's different

- **Offline-first, privacy tri-state** — `airgap` (default, data never leaves the device),
  `anon`, or `cloud`. Sync is opt-in, powered by an LWW sync engine.
- **BYOK AI Coach** — plug in your own Anthropic or Gemini API key; streaming responses
  over SSE, keys handled server-side only, never shipped to the frontend.
- **Zero frameworks** — hand-tuned Vanilla JS (ES Modules), Store/View architecture,
  spring-physics animations, GPU-only transforms. Lighthouse 97, WCAG AA.

## Features

- PPL workout logging with a 170-exercise library and drum-style set logger
- Dynamic Island status bar: live session tracking, rest timer, sync indicator
- Analytics: 1RM estimation, DOTS score, PR history, muscle fatigue heatmap
- Cycle plans with exercise aliasing (rename lifts without losing weight history)
- Body stats, plate calculator, 3-step onboarding with fast skip
- Installable PWA: Service Worker precache, self-hosted fonts, works fully offline

## Quick Start

```bash
npm install
cp .env.example .env       # fill in ANTHROPIC_API_KEY (optional — only for AI coach)
npm run dev                 # http://localhost:3000
```

## Tech

- **Frontend:** Vanilla JS (ES Modules), no frameworks. Store/View split per module.
- **Backend:** Express (ESM) — helmet + CSP, compression, rate limiting, zod validation.
- **Storage:** IndexedDB (offline-first) + optional Supabase/Firebase cloud sync.
- **AI:** `lib/aiOrchestrator.js` — multi-engine (Anthropic / Gemini), BYOK, SSE via `POST /api/coach`.

## Env Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | For AI coach | `POST /api/coach` |
| `PORT` | No (default 3000) | Server port |
| `SUPABASE_URL` | No | Cloud sync |
| `SUPABASE_ANON_KEY` | No | Cloud sync |

## Tests

```bash
npm test                # unit + integration (node --test)
npm run test:e2e        # Playwright e2e
```

## Docs

- `CLAUDE.md` — dev guide for Claude Code
- `DESIGN.md` — design system spec (OLED near-black, glassmorphism, token palette)
- `ROADMAP_elite_athlete-pro.md` — roadmap
- `CHANGELOG.md` — version history
