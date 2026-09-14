---
description: Архитектура и код-конвенции Athlete Pro — Store/View, бэкенд, навигация, ключевые файлы, запреты при правке кода.
paths:
  - "js/**"
  - "routes/**"
  - "lib/**"
  - "css/**"
  - "server.js"
  - "sw.js"
  - "index.html"
  - "scripts/**"
---

# Architecture

**Store/View pattern** — каждый модуль разделён:

- `*.store.js` — state, data, business logic (ноль обращений к DOM)
- `*.view.js` — DOM, events, UI. **Не зовёт `DB.*` напрямую** — читает/пишет
  через функции своего `*.store.js` (A15). Долг существующих файлов — сторожит
  `test/import-guard.test.js` (baseline, не даёт расти); массовая миграция —
  отдельными PR по поверхности, не одним

**Backend**: `server.js` (helmet+CSP, compression, rate-limit, zod) → `routes/coach.js` + `routes/integrations.js` → `lib/aiOrchestrator.js`

**Navigation**: `shell.js` → `Nav.go('s-home')` переключает экраны

## Key Files

| File | What |
|------|------|
| `js/app.js` | Frontend entry, lazy loading, Integrity.check |
| `js/shared/utils.js` | `esc()` — XSS escape, Haptic Gate |
| `js/shared/integrity.js` | Contract-First Integrity guard |
| `js/privacy.store.js` | Режимы cloud / anon / airgap (default: airgap) |
| `lib/aiOrchestrator.js` | Мульти-движок AI (anthropic/gemini, BYOK) |
| `NEXT_SESSION.md` | Кросс-агентный handoff |

## Run

```bash
# Полевое тестирование на телефоне (НЕ заменяй server.js!):
node scripts/telemetry-server.mjs --lan
```

## Конвенции кода

Процессные правила (версия, флаги, PR, миграции) — в `CLAUDE.md` § Rules. Здесь только то,
что действует в момент правки кода. Протокол аудита безопасности — `.claude/rules/security.md`:
по путям он не грузится, открывать по запросу.

- Vanilla JS only — no React/Vue/jQuery
- **ES-модули везде** — и фронт, и бэкенд (`server.js`, `routes/`, `lib/` на `import`). CommonJS в проекте нет
- Тяжёлые модули грузятся лениво через динамический `import()` из `js/app.js`; ядро (db, shell, dashboard, timer) — сразу
- **IndexedDB:** менял схему — поднимай `DB_VERSION` в `js/db/core.js` и пиши миграцию в `onupgradeneeded`
- **Нижняя навигация — ровно четыре вкладки** (Home · Train · Stats · Profile). Новый экран получает вход из того контента, который расширяет — паттерн «section-header + `.btn-text`». Экран вне таб-бара ОБЯЗАН нести `data-action="nav:back"`, иначе тупик. Сторожит `test/nav-law.test.js`
- API keys через backend proxy, никогда на фронте
- `esc()` из `js/shared/utils.js` для ВСЕХ innerHTML с данными
- Эмодзи в UI/коде запрещены — только SVG (правило DESIGN_DNA)
- Вибрация — только через Haptic Gate (`js/shared/utils.js`), не напрямую
- Canvas: multiply by `devicePixelRatio`
- Animations: GPU-only (`transform`/`opacity`), Spring Physics из `js/shared/spring.js`
- Route files: suffix only (`/coach` not `/api/coach`)
- `sw.js`: ASSETS генерить через `npm run build:sw` (НЕ руками) — сторожит `test/sw-cache-name.test.js`
- **Тронул `js/` или `css/` — подними номер** (`js/version.js` + `package.json`+lock). Гард `test/version-bump-required.test.js` сверяет номер с `origin/main`, а не наличие файла в диффе: одинаковый бамп в стопке веток схлопывается при ребейзе без конфликта, и проверка по диффу зеленела бы там, где в прод уезжает старый номер. Обход: `VERSION_BUMP_OK=1`
- `server.js` никогда не заменять отладочными стабами — для телеметрии есть `scripts/telemetry-server.mjs`
- **Миграция планов:** при смене сид/дефолт-плана новые имена упражнений ОБЯЗАНЫ нести `alias: [старые имена]` — префилл истории ищет по имени, без алиасов веса пользователя отвязываются (кейс 0кг 2026-07-08)

## Перф-замер (MEASURE-1)

`node scripts/profile.mjs` для любой перф-карточки, не по памяти агента:

- **CPU-троттлинг под целевое устройство, не под дефолт тулы.** Galaxy S23 по JS — класс
  десктопа → `--cpu=1`. Дефолт скрипта `--cpu=4` (mid-tier Android) годится, только если
  цель — реально бюджетный телефон; указывать throttle явно, не полагаться на дефолт.
- **Сидировать IDB** — без `--seed=N` (дефолт 120) холодный старт показывает онбординг,
  а не дашборд с данными; меряется не тот экран.
- **Coverage отдельным прогоном.** `Profiler.startPreciseCoverage` искажает тайминги —
  таймингный прогон всегда с `--coverage=0`, coverage (мёртвый JS/CSS) — отдельный запуск.
- **Headless даёт постоянный сдвиг ~2.6 с на этой машине.** Абсолютные FCP/LCP из headless
  в отчёты/карточки/CHANGELOG не попадают — только дельта между «до» и «после», снятая в
  одной сессии на одной машине теми же флагами.
- **До/после — минимум по одному прогону на сторону**, одинаковые флаги, один и тот же порт
  и seed. Разные машины/сессии/сиды сравнивать нельзя — шум перекроет эффект.
