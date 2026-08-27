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
---

# Architecture

**Store/View pattern** — каждый модуль разделён:

- `*.store.js` — state, data, business logic (ноль обращений к DOM)
- `*.view.js` — DOM, events, UI

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
- `server.js` никогда не заменять отладочными стабами — для телеметрии есть `scripts/telemetry-server.mjs`
- **Миграция планов:** при смене сид/дефолт-плана новые имена упражнений ОБЯЗАНЫ нести `alias: [старые имена]` — префилл истории ищет по имени, без алиасов веса пользователя отвязываются (кейс 0кг 2026-07-08)
