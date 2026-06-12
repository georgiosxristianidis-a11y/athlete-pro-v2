# CLAUDE.md — Athlete Pro

> Основной активный проект. Разработка ведётся мультиагентно: Claude Code + Gemini Pro + Antigravity.
> Дочерний проект: FIT ELITE (`C:\projects\fit-elite`).

## Multi-Agent Protocol

- **Рабочая ветка:** `2026-04-14-byoi` (main синхронизируется из неё). Перед стартом сверь `git branch --show-current`.
- **Handoff между сессиями/агентами:** `NEXT_SESSION.md` в корне (правило GIO Context Integrity) — читать первым.
- Незакоммиченные диффы могут быть живым WIP другого агента — сверяйся с NEXT_SESSION.md, не откатывай вслепую.
- Antigravity-артефакты (task/plan/walkthrough): `~/.gemini/antigravity/brain/<uuid>/`.
- Стандарты GIO: `~/.gemini/GEMINI.md` (глобальный) + `GEMINI.md` в корне (Karpathy guidelines). Триггер `#Аудит` — элитная диагностика.

## Stack

- Frontend: Vanilla JS (ES Modules), no frameworks
- Backend: Express/Node.js (**ESM**, `"type": "module"`)
- DB: IndexedDB (offline-first) + optional Supabase/Firebase
- AI: `lib/aiOrchestrator.js` — Anthropic + Gemini, BYOK, SSE via `POST /api/coach`
- PWA: Service Worker + manifest

## Run

```bash
npm install
cp .env.example .env   # заполни ANTHROPIC_API_KEY
npm run dev             # http://localhost:3000

# Полевое тестирование на телефоне (НЕ заменяй server.js!):
node scripts/telemetry-server.mjs --lan
```

## Architecture

**Store/View pattern** — каждый модуль разделён:
- `*.store.js` — state, data, business logic (ноль обращений к DOM)
- `*.view.js` — DOM, events, UI

**Backend**: `server.js` (helmet+CSP, compression, rate-limit, zod) → `routes/coach.js` + `routes/integrations.js` → `lib/aiOrchestrator.js`

**Navigation**: `shell.js` → `Nav.go('s-home')` переключает экраны

## Key Files

| File | What |
|------|------|
| `server.js` | Express entry (ESM), helmet/CSP, static + API |
| `js/app.js` | Frontend entry, lazy loading, Integrity.check |
| `js/db.js` | IndexedDB layer (7 stores) |
| `js/shared/utils.js` | `esc()` — XSS escape, Haptic Gate |
| `js/shared/spring.js` | Spring Physics для анимаций |
| `js/shared/integrity.js` | Contract-First Integrity guard |
| `js/privacy.store.js` | Режимы cloud / anon / airgap (default: airgap) |
| `js/sync.js` | LWW Sync Engine V2.1 |
| `lib/aiOrchestrator.js` | Мульти-движок AI (anthropic/gemini, BYOK) |
| `exercises-library.json` | 170 exercises (85KB) |
| `DESIGN.md` | Full design system spec |
| `NEXT_SESSION.md` | Кросс-агентный handoff |

## Design

- Primary: #00c86e (Forest Emerald) — НЕ #F2CA50 из DESIGN.md (DESIGN.md = Vantablack theme)
- Push: #6366f1 / Pull: #06b6d4 / Legs: #f59e0b / Gold accents: var(--c-gold)
- Glassmorphism: backdrop-filter, глубина через тени
- «No 1px borders» — правило под ревизией (в коде ~90 отступлений; решение ожидается)
- Mobile-first, 600px breakpoint

## Rules

- Vanilla JS only — no React/Vue/jQuery
- API keys через backend proxy, никогда на фронте
- `esc()` из `js/shared/utils.js` для ВСЕХ innerHTML с данными
- Эмодзи в UI/коде запрещены — только SVG (правило DESIGN_DNA)
- Вибрация — только через Haptic Gate (`js/shared/utils.js`), не напрямую
- Canvas: multiply by `devicePixelRatio`
- Animations: GPU-only (`transform`/`opacity`), Spring Physics из `shared/spring.js`
- Route files: suffix only (`/coach` not `/api/coach`)
- `sw.js`: новые js-файлы добавлять в ASSETS + поднимать версию кеша
- `server.js` никогда не заменять отладочными стабами — для телеметрии есть `scripts/telemetry-server.mjs`

## Tests

```bash
npm test                # node --test (unit + integration)
npx playwright test     # e2e (отдельно, не через node --test)
```

## Status

- Milestone 1.0 — COMPLETE (March 2026): архитектура, Lighthouse 97, WCAG AA, AI Autopilot
- v1.18.x — Bento Grid UI, Dynamic Island в статус-баре, privacy tri-state, LWW sync
- Текущий вектор: ремонт тестовой базы → SSE hardening → CRDT foundation (UUID вместо autoIncrement)
- См. `ROADMAP_elite_athlete-pro.md` и `NEXT_SESSION.md`
