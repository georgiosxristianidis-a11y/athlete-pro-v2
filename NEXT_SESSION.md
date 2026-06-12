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

- [ ] Эмодзи из UI-разметки → SVG/текст: `intel.view.js:496` («ЦНС»), `plate-calc.js:95` (warn) + ревизия db.js, handlers.js, supabase*.js, progressive-overload.js, integrity.js
- [ ] `dynamic-island.js:356` — vibrate через Haptic Gate (`shared/utils.js`), не напрямую
- [ ] `timer.js` — `clearInterval(_interval)` перед каждым `setInterval` в `start()` (двойной вызов = утечка)
- [ ] Решение по 90 × `border: 1px solid` — узаконить в CLAUDE.md или зачистить
- [ ] Убрать предписание эмодзи из AI system prompt (если ещё осталось в `_buildSystemPrompt`)

## Далее (Phase 4–5)

- [ ] **CRDT Foundation**: UUID вместо `autoIncrement` в db.js (7 сторов, миграция DB_VERSION+1), `updatedAt`+`deviceId`, LWW-ключи на UUID. Оба аудита (Claude + Antigravity) сошлись: это блокер Local-first Sync.
- [ ] **Полевой прогон** по `~/.gemini/antigravity/brain/14a057e9.../mobile_field_testing.md` через `node scripts/telemetry-server.mjs --lan`
- [ ] Playwright e2e зелёные + GitHub Actions CI

## Заметки для ИИ (Context Integrity)

- PiP-гибрид подтверждён пользователем: остров фиксирован в статус-баре, таймер выносится в системное PiP-окно.
- Зелёная вспышка завершения сета (`island-set-pulse`) — НЕ ТРОГАТЬ.
- Модель в оркестраторе — `claude-3-5-sonnet-20241022` (устаревшая; обновление = продуктовое решение пользователя, не делать молча).
- Незакоммиченные диффы могут быть WIP другого агента (Claude/Gemini/Antigravity) — сверяться с этим файлом перед откатом.
