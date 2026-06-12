# План на следующую сессию (Next Session Handoff)

> Обновлено: 2026-06-12, сессия Claude (Fable 5). Ветка `2026-04-14-byoi`, HEAD `beeb78c`, main синхронизирован.

## Текущая цель
**Phase 3 — Design DNA Sweep**, затем **Phase 4 — CRDT Foundation** (по плану FAANG-аудита 2026-06-12).

## Что уже сделано (сессия 2026-06-12)

1. **Dynamic Island в статус-баре — закоммичен** (`866d31f`): drag вырезан, mode-idle, PiP-гибрид, set-pulse не тронут. Плюс календарь Bento в Analytics, золотые стрики/PR, клик по streak.
2. **server.js восстановлен из HEAD.** Telemetry-стаб (полевое тестирование) вынесен в `scripts/telemetry-server.mjs` — path traversal закрыт, localhost по умолчанию, `--lan` для телефона. **Никогда больше не заменять server.js стабом.**
3. **Репозиторий вычищен** (`750c01c`): untracked `ATH-PRO vanilla google/`, `test-results/`, e2e-report; удалены пустые мусорные файлы (`{})`, `0)`, `i` и пр.).
4. **CLAUDE.md переписан**: проект разморожен, описан мультиагентный протокол, актуальная архитектура.
5. **Зависимости**: `npm audit fix` — 0 уязвимостей (был high в path-to-regexp). GIO pre-push гейты (SCA+SAST) проходят.
6. **Тесты: 103/103 зелёные** (было 43/74 + 27 cancelled):
   - `cryptoClient.js` — ленивый Worker (модуль снова импортируется в Node);
   - `npm test` = `node --test "test/*.test.js"` (playwright e2e — отдельно);
   - `coach-validate.test.js` переписан под экспортированную zod `coachSchema`.
7. **API-контракты восстановлены** (`beeb78c`), найдены и закрыты регрессии рефакторинга на оркестратор:
   - `coachSchema.messages` снова строгая (role enum, 1–12000 символов, 1–40 сообщений);
   - zod v4: `error.issues` (details были undefined);
   - graceful fallback вернулся в `/generate-plan` (дефолтный план) и `/recommendations` (maintain weights);
   - **фронт бил в 404**: `/api/generate-plan` и `/api/recommendations` → исправлено на `/api/coach/*` (workout.store.js:666, claude.store.js:256);
   - оркестратор: проверка ключа ДО вызова SDK (тесты больше не ходят в живой API), BYOK customKey теперь работает и для Anthropic;
   - **SSE hardening**: AbortController на `req close` (нет token-burn после ухода клиента) + watchdog 120s (504 AI_TIMEOUT).

## Чек-лист следующей сессии (Phase 3 — Design DNA)

> Инвентаризация начата 2026-06-12 (прервана): подтверждены `plate-calc.js:94` (символ warn в `pc-warn`) и `intel.view.js:496`. ВАЖНО: стрелки `→` (U+2192) в строках/комментариях — это типографика, НЕ эмодзи, не вычищать.

- [x] Эмодзи из UI-разметки и кода — вычищены полностью (intel.view, plate-calc, getTypeIcon `↑`, db, handlers, supabase*, integrity); типографика (`→`, `✓` в комментах) сохранена
- [x] `dynamic-island.js` — long-press vibrate через `haptic()` gate
- [x] `timer.js` — все 4 интервала через `_startTicking()` с clearInterval-guard (проверено triple-start)
- [x] Borders: решение пользователя — **узаконить glass-hairlines**. 31 захардкоженный rgba сведён к токенам: 76× `--c-border` + 5× `--c-border-h`, 0 hardcoded. Правило переписано в CLAUDE.md + DESIGN.md
- [x] AI system prompt — проверен, эмодзи-предписаний нет (0 вхождений)

**PHASE 3 — COMPLETE (2026-06-12, commits 7aadd1b + 34c6f3c, тесты 103/103)**

## Phase 4 — CRDT Foundation: COMPLETE (2026-06-12, commit 7068c64)

- [x] `newId()` — UUID v4 (+fallback для non-secure context при LAN-тестах), `getDeviceId()` — стабильный id установки
- [x] `withMeta()` — id/updatedAt/deviceId на каждой записи 6 синхронизируемых сторов; legacy integer-id сохранены
- [x] Миграция DB_VERSION 2→3: backfill updatedAt+deviceId курсорами в upgrade-транзакции (id не трогаем)
- [x] `js/shared/lww.js` — чистый `lwwWins()` с deviceId-tiebreak (нет split-brain при равных ts), вшит в sync.js
- [x] CRDT-мета стрипается из Supabase-payload (в серверной схеме нет таких колонок)
- [x] Календарь: `parseInt(wid)` больше не ломает UUID; legacy-числа остаются числами (IDB-ключи типизированы)
- [x] sw.js: precache lww.js, кеш v41 · Тесты: 118/118 (+15 CRDT)

**ВАЖНО для полевого теста:** первый запуск после обновления выполнит миграцию IDB v3 — проверить на телефоне, что данные на месте (workouts/metrics/1RM). Tombstone-удаления теперь тоже несут LWW-мету.

## Текущая цель следующей сессии: Phase 5 — полевые тесты + e2e/CI (или Phase 6 Lighthouse)

- [ ] **CRDT Foundation**: UUID вместо `autoIncrement` в db.js (7 сторов, миграция DB_VERSION+1), `updatedAt`+`deviceId`, LWW-ключи на UUID. Оба аудита (Claude + Antigravity) сошлись: это блокер Local-first Sync.
- [ ] **Полевой прогон** по `~/.gemini/antigravity/brain/14a057e9.../mobile_field_testing.md` через `node scripts/telemetry-server.mjs --lan`
- [ ] Playwright e2e зелёные + GitHub Actions CI

## Phase 6 — Performance & JS Payload Optimization (Lighthouse Validation)

> По прогону Lighthouse: UI-метрики идеальны (CLS 0, TBT 0ms), но Main-Thread перегружен парсингом и выполнением JS.

- [ ] **Audit Extensions Impact**: категория Other заняла 1.9s, Lighthouse прямо указал на влияние расширений Chrome. Контрольный замер в Incognito Mode (или `chrome --user-data-dir=tmp`) — отделить вклад расширений от реального бюджета приложения.
- [ ] **JS Execution / Bootup Time**: Script Evaluation 1.0s, парсинг 0.6s. Ревизия размеров бандлов: убедиться, что тяжёлые модули (графика/canvas, intel, body-stats; серверный aiOrchestrator фронта не касается — проверить клиентские аналоги claude.store/insights.engine) грузятся строго через ленивые `import()` и не блокируют старт. Снять профиль `app.js` boot-чейна.
- [ ] **SW Precache Strategy**: LCP 2.2s / FCP 1.7s — хорошие, улучшаются полнотой precache. Сверить ASSETS в `sw.js` с фактическим списком js/css (известный класс бага: в прошлом аудите sw.js упускал 6 файлов, включая сплит `workout.view/`). Поднять версию кеша после правки. Идея на будущее: автогенерация ASSETS скриптом, чтобы класс бага исчез.

## Заметки для ИИ (Context Integrity)

- PiP-гибрид подтверждён пользователем: остров фиксирован в статус-баре, таймер выносится в системное PiP-окно.
- Зелёная вспышка завершения сета (`island-set-pulse`) — НЕ ТРОГАТЬ.
- Модель в оркестраторе — `claude-3-5-sonnet-20241022` (устаревшая; обновление = продуктовое решение пользователя, не делать молча).
- Незакоммиченные диффы могут быть WIP другого агента (Claude/Gemini/Antigravity) — сверяться с этим файлом перед откатом.
