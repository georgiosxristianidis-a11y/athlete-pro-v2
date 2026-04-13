# Athlete Pro — PPL Workout Tracker + AI Coach

> ⚠️ **Frozen project.** Active development moved to [FIT ELITE](../fit-elite/).
> This codebase is functional and can be used for reference, testing, or resumed later.

## Quick Start

```bash
npm install
cp .env.example .env       # fill in ANTHROPIC_API_KEY
npm start                   # http://localhost:3000
```

## What's Here

- PPL workout logging with 170-exercise library
- AI coach via Claude Opus (SSE streaming)
- 1RM estimation, muscle fatigue heatmap
- Dashboard, analytics, body stats, profile
- Offline PWA (Service Worker + IndexedDB)
- Rest timer, plate calculator
- Lighthouse 97/100, WCAG AA compliant

## Tech

Vanilla JS frontend (no frameworks) + Express backend + IndexedDB.
Optional cloud sync via Supabase or Firebase.

## Env Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | For AI coach | `POST /api/coach` |
| `PORT` | No (default 3000) | Server port |
| `SUPABASE_URL` | No | Cloud sync |
| `SUPABASE_ANON_KEY` | No | Cloud sync |

## Docs

- `CLAUDE.md` — dev guide for Claude Code
- `DESIGN.md` — Vantablack Luxury design system
- `ROADMAP_elite_athlete-pro.md` — 8-phase plan
- `CHANGELOG.md` — version history
