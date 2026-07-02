# CLAUDE.md — Athlete Pro

> Основной активный проект. Разработка ведётся мультиагентно: Claude Code + Gemini Pro + Antigravity.
> Дочерний проект: FIT ELITE (`C:\projects\fit-elite`).

## Multi-Agent Protocol

- **Рабочая ветка:** `2026-04-14-byoi` (main синхронизируется из неё). Перед стартом сверь `git branch --show-current`.
- **Handoff между сессиями/агентами:** `NEXT_SESSION.md` в корне (правило GIO Context Integrity) — читать первым.
- Незакоммиченные диффы могут быть живым WIP другого агента — сверяйся с NEXT_SESSION.md, не откатывай вслепую.
- Antigravity-артефакты (task/plan/walkthrough): `~/.gemini/antigravity/brain/<uuid>/`.
- Стандарты GIO: `~/.gemini/GEMINI.md` (глобальный) + `GEMINI.md` в корне (Karpathy guidelines). Триггер `#Аудит` — элитная диагностика.

## Session Protocol (ассистент)

> Полный гайд для человека — `RULES.md`. Здесь — что ассистент ОБЯЗАН делать каждую сессию.

- **Старт:** спросить «одна цель на сессию?»; расплывчато («по уму») → переспросить, не угадывать. Принять формат: ЦЕЛЬ / ГДЕ СТОП / НЕ ТРОГАТЬ.
- **В процессе:** самому напоминать «Коммит?» / «Чекпоинт?» после каждого готового куска; длинно → предложить чекпоинт + новую сессию ДО compact.
- **Финиш:** самому собрать короткий хендофф (узкий файл под фазу, не god-object) + обновить память.
- **Verify-over-trust:** любое «готово» (вкл. Gemini) — гипотеза, пока gate-команда != 0.
- **Изоляция:** агенты пишут только в свой worktree; в trunk мёржит только LEAD после gate.
- **Рекомендация, не меню:** при выборе советовать лучший для проекта вариант + 1 строка «почему»; решает человек.
- Один разговор = одна цель; длинные ресёрчи — субагентом, в trunk только итог.

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

- Палитра — двухуровневая (решение 1-2, 2026-06-14). Цвета только через токены `css/base.css :root`.
  - **BRAND (единственные декоративные акценты):** primary `--c-accent` (#00e676 green), secondary `--c-secondary` (#8b5cf6 violet, цвет лого). CTA/active/focus/бренд — только эти два.
  - **SEMANTIC (только по смыслу, не для декора):** PPL — `--c-push`(green)/`--c-pull`(cyan)/`--c-legs`(purple); статус — `--c-amber`(warning/PR)/`--c-red`(#ff4d88 error/danger/HR); achievement — `--c-gold` (PR/streak).
  - PPL-закон: Push=green · Pull=cyan · Legs=purple. В коде типа тренировки — `--c-push/--c-pull/--c-legs`, не сырые hue.
- Glassmorphism: backdrop-filter, глубина через тени
- Borders: glass-hairlines узаконены (решение 2026-06-12) — только полупрозрачные через токены `var(--c-border)` (6%) / `var(--c-border-h)` (12%); НЕ хардкодить rgba, непрозрачные сплошные рамки запрещены. Акцентные подсветки (цветные rgba ≤20%) допустимы точечно
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
- `sw.js`: ASSETS генерить через `npm run build:sw` (НЕ руками), затем бамп `CACHE_NAME`
- **Версия:** при каждом стабильном мёрже в main бампить `VERSION` в `js/version.js` (показывается в профайл-меню) + синхронно `version` в `package.json`
- `server.js` никогда не заменять отладочными стабами — для телеметрии есть `scripts/telemetry-server.mjs`
- **Анти-хрупкость:** рискованный код — за флагом `js/flags.js` (Strangler-Fig); ветки < 24ч (trunk-based); застрял → `git checkout .` и дроби. Детали — `NEXT_SESSION.md` § Анти-хрупкий workflow

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
